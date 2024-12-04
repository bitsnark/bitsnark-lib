import { agentConf } from "../agent.conf";
import { array } from "./array-utils";
import { Db, DbValue, QueryArgs } from "./db";
import { jsonStringifyCustom } from "./json";
import { Input, Output, Setup, SetupStatus, Template, TemplateStatus } from "./types";

export interface UpdateTemplatePartial {
    setupId?: string;
    name: string;
    ordinal?: number;
    txid?: string;
    unknownTxId?: boolean;
    inputs: Input[];
    outputs: Output[];
}

export interface updateSetupPartial {
    payloadTxid: string;
    payloadOutputIndex: number;
    payloadAmount: bigint;
    stakeTxid: string;
    stakeOutputIndex: number;
    stakeAmount: bigint;
}

const setupFields = ['id', 'protocol_version', 'status', 'last_checked_block_height', 'wots_salt',
    'payload_txid', 'payload_output_index', 'payload_amount',
    'stake_txid', 'stake_output_index', 'stake_amount'];

const setupFieldsToInsert = ['id', 'wots_salt',
    'payload_txid', 'payload_output_index', 'payload_amount',
    'stake_txid', 'stake_output_index', 'stake_amount',
    'status', 'protocol_version'];

const templateFields = ['template_id', 'name', 'role', 'is_external', 'unknown_txid', 'ordinal', 'setup_id',
    'protocol_version', 'txid', 'inputs', 'outputs'];

function isCap(c: string): boolean {
    return c >= 'A' && c <= 'Z';
}

function toCap(s: string): string {
    return s.length > 0 ?
        s.split('')[0].toUpperCase() + s.split('').slice(1) : '';
}

function camelToSnake(name: string): string {
    return name.split('').map(c => isCap(c) ? '_' + c.toLowerCase : c).join('');
}

function snakeToCamel(name: string): string {
    return name.split('_').map((s, i) => i == 0 ? s : toCap(s)).join('');
}

function dollars(n: number): string {
    return array(n, i => `$${i + 1}`).join(', ');
}

function dollarsForUpdate(fields: string[], start: number): string {
    return fields.map((name, i) => `${name}=$${i + start}`).join(', ');
}

function objToRow<T>(fieldNames: string[], obj: T): DbValue[] {
    return fieldNames.map(k => (obj as any)[snakeToCamel(k)]);
}

function rowToObj<T>(fieldNames: string[], row: DbValue[]): T {
    const obj = {};
    fieldNames.forEach((k, i) => (obj as any)[camelToSnake(k)] = row[i]);
    return obj as T;
}

export class AgentDb extends Db {

    constructor(agentId: string) {
        super(agentId);
    }

    public static jsonizeObject<T>(obj: T): T {
        return JSON.parse(jsonStringifyCustom(obj));
    }

    /*** SETUP ***/

    public async createSetup(id: string, wotsSalt: string): Promise<Setup> {
        await this.query(
            `INSERT INTO setups (id, wots_salt) 
                VALUES ($1, $2)`,
            objToRow(setupFieldsToInsert, [id, wotsSalt])
        );
        return { id, wotsSalt, protocolVersion: agentConf.protocolVersion, status: SetupStatus.PENDING };
    }

    public async updateSetup(id: string, setup: updateSetupPartial) {
        const fields = ['payload_txid', 'payload_output_index', 'payload_amount', 'stake_txid',
            'stake_output_index', 'stake_amount'];
        await this.query(
            `UPDATE setups SET ${dollarsForUpdate(fields, 2)}
                WHERE id = $1`,
            [id, ...objToRow(fields, setup)]
        );
    }

    public async getSetup(setupId: string): Promise<Setup> {
        const rows = (await this.query<Setup>(
            `SELECT ${setupFields.join(', ')} FROM setups WHERE id = $1`,
            [setupId]
        )).rows;
        if (rows.length != 1) throw new Error(`Setup not found: ${setupId}`);
        return rowToObj<Setup>(setupFields, rows[0] as any);
    }

    private async markSetupStatus(setupId: string, status: SetupStatus) {
        await this.query(
            'UPDATE setups SET status = $1 WHERE id = $2',
            [SetupStatus[status], setupId]);
    }

    public async markSetupPegoutActive(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.ACTIVE);
    }

    public async markSetupPegoutSuccessful(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.PEGOUT_SUCCESSFUL);
    }

    public async markSetupPegoutFailed(setupId: string) {
        await this.markSetupStatus(setupId, SetupStatus.PEGOUT_FAILED);
    }

    public async updateSetupLastCheckedBlockHeight(setupId: string, blockHeight: number) {
        await this.query(
            'UPDATE setups SET last_checked_block_height = $1 WHERE id = $2',
            [blockHeight, setupId]);
    }

    public async updateSetupLastCheckedBlockHeightBatch(setupIds: string[], blockHeight: number) {
        await this.query(
            'UPDATE setups SET last_checked_block_height = $1 WHERE id = ANY($2)',
            [blockHeight, setupIds]);
    }

    public async getActiveSetups(): Promise<Setup[]> {
        return Promise.all(
            (await this.query('SELECT id FROM setups WHERE status = $1', [SetupStatus.ACTIVE])).rows
                .map(row => this.getSetup(row[0] as string))
        );
    }

    /*** Templates ***/

    public async getTemplates(setupId: string): Promise<Template[]> {
        return (await this.query<Template>(
            `SELECT ${templateFields.join(', ')}
                    FROM templates WHERE setup_id = $1
                    ORDER BY ordinal ASC`,
            [setupId]
        )).rows.map(row => rowToObj(templateFields, row as any));
    }

    public async insertTemplates(setupId: string, templates: Template[]) {
        // make sure they go into the right setup
        templates = templates.map(t => ({ ...t, setupId }));
        await this.session(
            templates.map(template => ({
                sql: `INSERT INTO templates (${templateFields.join(', ')})
                    VALUES (${dollars(templateFields.length)})`,
                args: objToRow(templateFields, template)
            }))
        );
    }

    public async updateTemplates(setupId: string, templates: UpdateTemplatePartial[]) {
        // make sure they go into the right setup
        templates = templates.map(t => ({ ...t, setupId }));
        const fields = ['ordinal', 'txid', 'inputs', 'outputs'];
        await this.session(
            templates.map(template => ({
                sql: `UPDATE templates SET ${dollarsForUpdate(fields, 3)}
                        WHERE setup_id = $1 AND name = $2`,
                args: [setupId, template.name, ...objToRow(fields, template)]
            }))
        );
    }

    public async upsertTemplates(setupId: string, templates: Template[]) {
        const ids = (await this.query<Template>(
            `SELECT template_id FROM templates WHERE setup_id = $1`,
            [setupId]
        )).rows.map(row => row[0]);
        const toInsert = templates.filter(t => ids.find(id => id == t.id));
        const toUpdate = templates.filter(t => !ids.find(id => id == t.id));
        await this.insertTemplates(setupId, toInsert);
        await this.updateTemplates(setupId, toUpdate);
    }

    public async markTemplateToSend(setupId: string, templateName: string, data?: Buffer[][]) {
        await this.query(
            `UPDATE templates
                SET updated = NOW(), data = $1, status = $2
                WHERE setup_id = $3 AND name = $4`,
            [
                data ? JSON.stringify(data.map((data) => data.map((buffer) => buffer.toString('hex')))) : null,
                TemplateStatus.READY,
                setupId,
                templateName
            ]
        );
    }

    // To assist mocking the DB in tests.
    public async query<Row>(sql: string, params?: QueryArgs) {
        return super.query<Row>(sql, params);
    }
}
