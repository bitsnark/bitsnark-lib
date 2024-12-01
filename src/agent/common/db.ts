import { Client, ResultRow, ResultRecord, connect } from 'ts-postgres';
import { Transaction, SpendingCondition } from '../common/transactions';
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
        return await connect({
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
        // Re-creating the client for each query.
        const client = await this.connect();
        try {
            return await client.query<Row>(sql, params ?? []);
        } catch (error) {
            console.error('Failed to execute query:', sql, params);
            throw error;
        } finally {
            await client.end();
        }
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
}

export enum SetupStatus {
    PENDING,
    UNSIGNED,
    SIGNED,
    FAILED,
    ACTIVE,
    PEGOUT_SUCCESSFUL,
    PEGOUT_FAILED
}

export enum OutgoingStatus {
    PENDING,
    READY,
    PUBLISHED,
    REJECTED
}

interface SetupRow {
    id: string;
    protocolVersion: string;
    status: SetupStatus;
    lastCheckedBlockHeight?: number;
    wotsSalt: string;
}

interface TemplateRow {
    name: string;
    role: AgentRoles;
    isExternal: boolean;
    ordinal: number;
    object: Transaction;
}

// Template row, with optional received fields and setup data.
export interface Template extends TemplateRow, Omit<SetupRow, 'id' | 'status' | 'wotsSalt'> {
    setupId: string;
    setupStatus: SetupStatus;
    txId: string | null;
    blockHash: string | null;
    blockHeight: number | null;
    rawTransaction: RawTransaction | null;
}

// Template row, with mandatory received fields.
export interface ReceivedTemplate extends TemplateRow {
    txId: string;
    blockHash: string;
    blockHeight: number;
    rawTransaction: RawTransaction;
}

// Setup row, with templates and received templates.
export interface Setup extends SetupRow {
    templates: Template[];
    received: ReceivedTemplate[];
}

export class AgentDb extends Db {
    private static templateFields = `
        templates.name, templates.role, templates.is_external, templates.ordinal, templates.object,
        received.transaction_hash, received.raw_transaction, received.block_hash, received.block_height,
        setups.id, setups.protocol_version,
        setups.status, setups.last_checked_block_height`;

    private static templateReader(row: ResultRow<ResultRecord>): Template {
        return {
            name: row[0],
            role: row[1],
            isExternal: row[2],
            ordinal: row[3],
            object: jsonParseCustom(JSON.stringify(row[4])),
            txId: row[5],
            rawTransaction: row[6],
            blockHash: row[7],
            blockHeight: row[8],
            setupId: row[10],
            protocolVersion: row[11],
            setupStatus: SetupStatus[row[12] as keyof typeof SetupStatus],
            lastCheckedBlockHeight: row[13]
        };
    }

    private static receivedTemplateReader(row: ResultRow<ResultRecord>): ReceivedTemplate {
        const receivedTemplate = AgentDb.templateReader(row) as ReceivedTemplate;
        for (const property of ['txId', 'blockHash', 'blockHeight', 'rawTransaction']) {
            if (receivedTemplate[property as keyof typeof receivedTemplate] === null) {
                throw new Error(`Received template does not have a ${property}`);
            }
        }
        return receivedTemplate;
    }

    constructor(agentId: string) {
        super();
        this.database = agentId;
    }

    private static jsonizeObject<T>(obj: T): T {
        return JSON.parse(jsonStringifyCustom(obj));
    }

    public async insertNewSetup(setupId: string, templates: Transaction[]) {
        await this.session([
            {
                sql: `INSERT INTO setups (id, protocol_version, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                args: [setupId, agentConf.protocolVersion, SetupStatus[SetupStatus.PENDING]]
            },
            ...templates.map((template) => ({
                sql: `
                    INSERT INTO templates (setup_id, name, role, is_external, ordinal, object, outgoing_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                args: [
                    setupId,
                    template.transactionName,
                    template.role,
                    template.external,
                    template.ordinal,
                    AgentDb.jsonizeObject(template),
                    OutgoingStatus[OutgoingStatus.PENDING]
                ]
            })),
            {
                sql: 'UPDATE setups SET status = $1 WHERE id = $2',
                args: [SetupStatus[SetupStatus.UNSIGNED], setupId]
            }
        ]);
    }

    private async markSetupStatus(setupId: string, status: SetupStatus) {
        await this.query('UPDATE setups SET status = $1 WHERE id = $2', [SetupStatus[status], setupId]);
    }

    public async markSetupPeggoutActive(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.ACTIVE);
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

    public async updateLastCheckedBlockHeightBatch(setupIds: string[], blockHeight: number) {
        await this.query('UPDATE setups SET last_checked_block_height = $1 WHERE id = ANY($2)', [
            blockHeight,
            setupIds
        ]);
    }

    public async upsertTemplates(setupId: string, templates: Transaction[]) {
        await this.session(
            templates.map((template) => ({
                sql: `
                    INSERT INTO templates (setup_id, name, role, is_external, ordinal, object, outgoing_status)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT(setup_id, name) DO UPDATE SET
                        role = $3, is_external = $4, ordinal = $5, object = $6, updated_at = NOW()`,
                args: [
                    setupId,
                    template.transactionName,
                    template.role,
                    template.external ?? false,
                    template.ordinal,
                    AgentDb.jsonizeObject(template),
                    OutgoingStatus[OutgoingStatus.PENDING]
                ]
            }))
        );
    }

    public async markToSend(setupId: string, templateName: string, data?: Buffer[][]) {
        await this.query(
            `
                UPDATE templates
                SET updated = NOW(), data = $1, status = $2
                WHERE setup_id = $3 AND name = $4
            `,
            [
                data ? JSON.stringify(data.map((data) => data.map((buffer) => buffer.toString('hex')))) : null,
                OutgoingStatus[OutgoingStatus.READY],
                setupId,
                templateName
            ]
        );
    }

    public async markReceived(
        setupId: string,
        transactionName: string,
        txId: string,
        blockHash: string,
        blockHeight: number,
        rawTransaction: RawTransaction
    ) {
        // Assert that the setup is active.
        const status = (await this.query('SELECT status FROM setups WHERE id = $1', [setupId]))
            .rows[0]?.[0] as SetupStatus;
        if (status != SetupStatus.ACTIVE) {
            throw new Error(
                `Status of ${setupId} is ${SetupStatus[status]} instead of ${SetupStatus[SetupStatus.ACTIVE]}`
            );
        }

        await this.query(
            `
                INSERT INTO received (template_id, transaction_hash, block_hash, block_height, raw_transaction)
                VALUES ((SELECT id FROM templates WHERE setup_id = $1 AND name = $2), $3, $4, $5, $6)
            `,
            [setupId, transactionName, txId, blockHash, blockHeight, JSON.stringify(rawTransaction)]
        );
    }

    public async getTemplates(setupId?: string): Promise<Template[]> {
        const setupFilter = setupId ? 'WHERE setups.id = $1' : '';
        return (
            await this.query<Template>(
                `
                    SELECT ${AgentDb.templateFields}
                    FROM templates
                    JOIN setups ON templates.setup_id = setups.id
                    LEFT JOIN received ON templates.id = received.template_id
                    ${setupFilter}
                    ORDER BY last_checked_block_height ASC, ordinal ASC
                `,
                [setupId]
            )
        ).rows.map(AgentDb.templateReader);
    }

    public async getReceivedTemplates(setupId: string): Promise<ReceivedTemplate[]> {
        return (
            await this.query<ReceivedTemplate>(
                `
                    SELECT ${AgentDb.templateFields}
                    FROM templates
                    JOIN setups ON templates.setup_id = setups.id
                    JOIN received ON templates.id = received.template_id
                    WHERE setups.id = $1
                    ORDER BY ordinal ASC
            `,
                [setupId]
            )
        ).rows.map(AgentDb.receivedTemplateReader);
    }

    public async createSetup(setupId: string, wotsSalt: string) {
        await this.query(
            `INSERT INTO setups 
                (id, status, protocol_version, wots_salt) VALUES ($1, $2, $3, $4)`,
            [setupId, SetupStatus[SetupStatus.PENDING], agentConf.protocolVersion, wotsSalt]
        );
    }

    public async getSetup(setupId: string): Promise<Setup> {
        const templates = await this.getTemplates(setupId);
        const received = await this.getReceivedTemplates(setupId);
        const setup = (
            await this.query<Setup>(
                `
                    SELECT id, protocol_version, status, last_checked_block_height, wots_salt
                    FROM setups
                    WHERE id = $1
                `,
                [setupId]
            )
        ).rows[0];
        return {
            id: setup[0] as string,
            protocolVersion: setup[1] as string,
            status: SetupStatus[setup[2] as keyof typeof SetupStatus],
            lastCheckedBlockHeight: setup[3] as number,
            wotsSalt: setup[4],
            templates,
            received
        };
    }

    public async getActiveSetups(): Promise<Setup[]> {
        return Promise.all(
            (await this.query('SELECT id FROM setups WHERE status = $1', [SetupStatus[SetupStatus.ACTIVE]])).rows.map(
                (row) => this.getSetup(row[0] as string)
            )
        );
    }

    // To assist mocking the DB in tests.
    public async query<Row>(sql: string, params?: QueryArgs) {
        return super.query<Row>(sql, params);
    }

    // Backward compatibility.

    public async getTransactions(setupId: string): Promise<Transaction[]> {
        return (await this.getSetup(setupId)).templates.map((template) => template.object);
    }
}
