import { Client, ResultRow, ResultRecord, connect } from 'ts-postgres';
import { Transaction } from '../common/transactions';
import { agentConf } from '../agent.conf';
import { RawTransaction } from 'bitcoin-core';
import { jsonStringifyCustom, jsonParseCustom } from './json';
import { AgentRoles } from './types';

type DbValue = string | number | boolean | object | null | undefined;
type QueryArgs = DbValue[];
interface Query {
    sql: string;
    args?: QueryArgs;
}

class Db {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connection?: Client;
    constructor(
        host: string = agentConf.postgresHost,
        port: number = agentConf.postgresPort,
        user: string = agentConf.postgresUser,
        password: string = agentConf.postgresPassword,
        database: string = 'postgres'
    ) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;
        this.database = database;
    }

    protected async connect() {
        this.connection = await connect({
            user: this.user,
            host: this.host,
            port: this.port,
            password: this.password,
            database: this.database,
            bigints: true,
            keepAlive: agentConf.postgresKeepAlive
        });
    }

    protected async query<Row>(sql: string, params?: QueryArgs) {
        if (this.connection === undefined || this.connection?.closed) await this.connect();
        return await this.connection!.query<Row>(sql, params ?? []);
    }

    protected async session(queries: Query[]): Promise<void> {
        this.query('BEGIN');
        try {
            for (const query of queries) {
                await this.query(query.sql, query.args);
            }
        } catch (error) {
            this.query('ROLLBACK');
            throw error;
        }
        this.query('COMMIT');
    }

    protected async disconnect() {
        await this.connection?.end();
        delete this.connection;
    }
}

enum SetupStatus { PENDING, READY, SIGNED, MERGED, FAILED, PEGGED, PEGOUT_SUCCESSFUL, PEGOUT_FAILED }
enum OutgoingStatus { PENDING, READY, PUBLISHED, REJECTED }

export interface EnrichedTemplate {
    name: string;
    role: AgentRoles;
    isExternal: boolean;
    ordinal: number;
    object: Transaction;
    outgoingStatus?: OutgoingStatus;
    transactionHash?: string;
    blockHash?: string;
    blockHeight?: number;
    rawTransaction?: RawTransaction;
}

export interface Setup {
    id: string;
    protocolVersion: string;
    status: SetupStatus;
    signed_at_block_height?: number;
    last_checked_block_height?: number;
}

export interface EnrichedSetup extends Setup {
    templates: EnrichedTemplate[];
    lastReceivedTemplate?: EnrichedTemplate;
}

export class AgentDb extends Db {

    private static EnrichedTemplatesFields = `
        templates.name, templates.role,
        templates.is_external, templates.ordinal,
        templates.object, templates.outgoing_status,
        received.transaction_hash, received.raw_transaction,
        received.block_hash, received.block_height`;

    private static EnrichedTemplateReader(row: ResultRow<ResultRecord>): EnrichedTemplate {
        const template: EnrichedTemplate = {
            name: row[0] as string,
            role: row[1] as AgentRoles,
            isExternal: row[2] as boolean,
            ordinal: row[3] as number,
            object: jsonParseCustom(JSON.stringify(row[4])),
            outgoingStatus: row[5] ? OutgoingStatus[row[5] as keyof typeof OutgoingStatus] : undefined,
        }
        if (row[6]) {
            template.transactionHash = row[6] as string;
            template.rawTransaction = JSON.parse(row[7] as string);
            template.blockHash = row[8] as string;
            template.blockHeight = row[9] as number;
        }
        return template;
    }

    constructor(agentId: string) {
        super();
        this.database = agentId;
    }

    private static jsonizeObject<T>(obj: T): T {
        return JSON.parse(jsonStringifyCustom(obj));
    }

    public async insertNewSetup(setupId: string, templates: Transaction[]) {
        await this.session([{
            sql: 'INSERT INTO setups (id, protocol_version) VALUES ($1, $2)',
            args: [setupId, agentConf.protocolVersion]
        }, ...templates.map((template) => ({
            sql: `INSERT INTO templates (setup_id, name, role, is_external, ordinal, object)
                VALUES ($1, $2, $3, $4, $5, $6)`,
            args: [
                setupId,
                template.transactionName,
                template.role,
                template.external,
                template.ordinal,
                AgentDb.jsonizeObject(template)]
        })), {
            sql: 'UPDATE setups SET status = $1 WHERE id = $2',
            args: [SetupStatus[SetupStatus.READY], setupId]
        }]);
    }

    private async markSetupStatus(setupId: string, status: SetupStatus) {
        await this.query('UPDATE setups SET status = $1 WHERE id = $2', [SetupStatus[status], setupId]);
    }

    public async markSetupPeggoutSuccessful(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.PEGOUT_SUCCESSFUL);
    }

    public async markSetupPeggoutFailed(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.PEGOUT_FAILED);
    }

    public async updateLastCheckedBlockHeight(setupId: string, blockHeight: number) {
        await this.query('UPDATE setups SET last_checked_block_height = $1 WHERE id = $2', [blockHeight, setupId]);
    }

    public async deleteSetup(setupId: string) {
        await this.query('DELETE FROM setups WHERE id = $1', [setupId]);
    }

    public async upsertTemplates(setupId: string, templates: Transaction[]) {
        await this.session(templates.map((template) => ({
            sql: `INSERT INTO templates (setup_id, name, role, is_external, ordinal, object)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT(setup_id, name) DO UPDATE SET
                    role = $3, is_external = $4, ordinal = $5, object = $6, updated_at = NOW()`,
            args: [
                setupId,
                template.transactionName,
                template.role,
                template.external ?? false,
                template.ordinal,
                AgentDb.jsonizeObject(template)
            ]
        })));
    }

    public async markToSend(setupId: string, templateName: string, data?: Buffer[][]) {
        await this.query(`
            UPDATE templates
            SET updated = NOW(), data = $1, status = $2
            WHERE setup_id = $3 AND name = $4
        `, [
            data ? JSON.stringify(data.map((data) => data.map((buffer) => buffer.toString('hex')))) : null,
            OutgoingStatus[OutgoingStatus.READY],
            setupId,
            templateName
        ]);
    }

    public async markReceived(
        setupId: string,
        transactionName: string,
        txId: string,
        blockHash: string,
        blockHeight: number,
        rawTransaction: RawTransaction
    ) {

        // Assert that the setup is pegged.
        const status =((await this.query(
            'SELECT status FROM setups WHERE id = $1', [setupId]
        )).rows[0]?.[0] as SetupStatus);
        if (status != SetupStatus.PEGGED) {
            throw new Error(`Status of ${setupId} is ${SetupStatus[status]} instead of PEGGED`);
        }

        await this.query(`
            INSERT INTO received (template_id, transaction_hash, block_hash, block_height, raw_transaction)
            VALUES ((SELECT id FROM templates WHERE setup_id = $1 AND name = $2), $3, $4, $5, $6)
        `, [setupId, transactionName, txId, blockHash, blockHeight, JSON.stringify(rawTransaction)]);
    }

    public async getReceivedTemplates(): Promise<EnrichedTemplate[]> {
        return (await this.query<EnrichedTemplate>(`
            SELECT ${AgentDb.EnrichedTemplatesFields}
            FROM templates
            JOIN received ON templates.id = received.template_id
        `)).rows.map(AgentDb.EnrichedTemplateReader);
    }

    private async getLastReceivedTemplate(setupId: string): Promise<EnrichedTemplate | undefined> {
        return (await this.query<EnrichedTemplate>(`
            SELECT ${AgentDb.EnrichedTemplatesFields}
            FROM templates
            JOIN received ON templates.id = received.template_id
            WHERE templates.setup_id = $1
            ORDER BY ordinal DESC
            LIMIT 1
        `, [setupId])).rows.map(AgentDb.EnrichedTemplateReader)[0];
    }

    private async getSetupTemplates(setupId: string): Promise<EnrichedTemplate[]> {
        return (await this.query<EnrichedTemplate>(`
            SELECT ${AgentDb.EnrichedTemplatesFields}
            FROM templates
            LEFT JOIN received ON templates.id = received.template_id
            WHERE templates.setup_id = $1
            ORDER BY ordinal ASC
        `, [setupId])).rows.map(AgentDb.EnrichedTemplateReader);
    }

    public async getSetup(setupId: string): Promise<EnrichedSetup> {
        const templates = await this.getSetupTemplates(setupId);
        const lastReceivedTemplate = await this.getLastReceivedTemplate(setupId);
        const setup = (await this.query<Setup>(`
            SELECT id, protocol_version, status, signed_at_block_height, last_checked_block_height
            FROM setups
            WHERE id = $1
        `, [setupId])).rows[0];
        return {
            id: setup[0] as string,
            protocolVersion: setup[1] as string,
            status: SetupStatus[setup[2] as keyof typeof SetupStatus],
            signed_at_block_height: setup[3] as number,
            last_checked_block_height: setup[4] as number,
            templates,
            lastReceivedTemplate
        };
    }

    public async getPeggedSetups(): Promise<EnrichedSetup[]> {
        return Promise.all((
            await this.query('SELECT id FROM setups WHERE status = $1', [SetupStatus[SetupStatus.PEGGED]])
        ).rows.map((row) => this.getSetup(row[0] as string)));
    }

    public async disconnect() {
        await super.disconnect();
    }

    // Backward compatibility.

    public async getTransactions(setupId: string): Promise<Transaction[]> {
        return (await this.getSetup(setupId)).templates.map((template) => template.object);
    }

}
