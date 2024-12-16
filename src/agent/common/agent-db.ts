import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { array } from './array-utils';
import { Db, DbValue, QueryArgs } from './db';
import { jsonParseCustom, jsonStringifyCustom } from './json';
import { Input, Output, ReceivedTransaction, Setup, SetupStatus, Template, TemplateStatus } from './types';

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

const setupFields = [
    'id',
    'protocol_version',
    'status',
    'last_checked_block_height',
    'payload_txid',
    'payload_output_index',
    'payload_amount',
    'stake_txid',
    'stake_output_index',
    'stake_amount'
];

export const templateFields = [
    'id',
    'name',
    'role',
    'is_external',
    'unknown_txid',
    'ordinal',
    'setup_id',
    'txid',
    'inputs',
    'outputs',
    'status',
    'protocol_data'
];

function toCap(s: string): string {
    return s.length > 0 ? s.split('')[0].toUpperCase() + s.split('').slice(1).join('') : '';
}

function snakeToCamel(name: string): string {
    const s = name
        .split('_')
        .map((s, i) => (i == 0 ? s : toCap(s)))
        .join('');
    return s;
}

function dollars(n: number): string {
    return array(n, (i) => `$${i + 1}`).join(', ');
}

function dollarsForUpdate(fields: string[], start: number): string {
    return fields.map((name, i) => `${name}=$${i + start}`).join(', ');
}

function jsonizeObject<T>(obj: T): T {
    return JSON.parse(jsonStringifyCustom(obj));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objToRow(fieldNames: string[], obj: any): DbValue[] {
    const row = fieldNames.map((k) => obj[snakeToCamel(k)]).map((v) => (v != null ? jsonizeObject(v) : undefined));
    return row;
}

export function rowToObj<T>(fieldNames: string[], row: DbValue[], jsonFields: string[] = []): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = {};
    fieldNames.forEach((k, i) => {
        if (jsonFields.find((tk) => tk == k)) row[i] = jsonParseCustom(JSON.stringify(row[i]));
        obj[snakeToCamel(k)] = row[i];
    });
    return obj as T;
}

export class AgentDb extends Db {
    constructor(agentId: string) {
        super(agentId);
    }

    /*** SETUP ***/

    public async createSetup(setupId: string): Promise<Setup> {
        await this.query(
            `INSERT INTO setups (id, protocol_version, status)
                VALUES ($1, $2, $3)`,
            [setupId, agentConf.protocolVersion, SetupStatus.PENDING]
        );
        return { id: setupId, protocolVersion: agentConf.protocolVersion, status: SetupStatus.PENDING };
    }

    public async updateSetup(setupId: string, setup: updateSetupPartial): Promise<Setup> {
        const fields = [
            'payload_txid',
            'payload_output_index',
            'payload_amount',
            'stake_txid',
            'stake_output_index',
            'stake_amount'
        ];
        await this.query(
            `UPDATE setups SET ${dollarsForUpdate(fields, 2)}
                WHERE id = $1`,
            [setupId, ...objToRow(fields, setup)]
        );
        return await this.getSetup(setupId);
    }

    public async getSetup(setupId: string): Promise<Setup> {
        const rows = (await this.query<Setup>(`SELECT ${setupFields.join(', ')} FROM setups WHERE id = $1`, [setupId]))
            .rows;
        if (rows.length != 1) throw new Error(`Setup not found: ${setupId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rowToObj<Setup>(setupFields, rows[0] as any, ['payload_amount', 'stake_amount']);
    }

    private async markSetupStatus(setupId: string, status: SetupStatus) {
        await this.query('UPDATE setups SET status = $1 WHERE id = $2', [SetupStatus[status], setupId]);
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
        await this.query('UPDATE setups SET last_checked_block_height = $1 WHERE id = $2', [blockHeight, setupId]);
    }

    public async updateSetupLastCheckedBlockHeightBatch(setupIds: string[], blockHeight: number) {
        await this.query('UPDATE setups SET last_checked_block_height = $1 WHERE id = ANY($2)', [
            blockHeight,
            setupIds
        ]);
    }

    public async getActiveSetups(): Promise<Setup[]> {
        return Promise.all(
            (
                await this.query('SELECT id FROM setups WHERE status = $1 ORDER BY last_checked_block_height ASC', [
                    SetupStatus.ACTIVE
                ])
            ).rows.map((row) => this.getSetup(row[0] as string))
        );
    }

    /*** Templates ***/

    public async getTemplates(setupId: string): Promise<Template[]> {
        const rows = (
            await this.query<Template>(
                `SELECT ${templateFields.join(', ')}
                    FROM templates WHERE setup_id = $1
                    ORDER BY ordinal ASC`,
                [setupId]
            )
        ).rows;
        if (rows.length == 0) throw new Error(`No templates found, setupId: ${setupId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return rows.map((row) => rowToObj(templateFields, row as any, ['inputs', 'outputs', 'protocol_data']));
    }

    public async insertTemplates(setupId: string, templates: Template[]) {
        // make sure they go into the right setup
        // let the db make a new id
        templates = templates.map((t) => ({
            ...t,
            setupId,
            status: t.status ?? TemplateStatus.PENDING
        }));
        const fieldsNoId = templateFields.filter((s) => s != 'id' && s != 'protocol_data');
        for (const template of templates) {
            await this.query(
                `INSERT INTO templates (${fieldsNoId.join(', ')}) VALUES (${dollars(fieldsNoId.length)})`,
                objToRow(fieldsNoId, template)
            );
        }
    }

    public async updateTemplates(setupId: string, templates: UpdateTemplatePartial[]) {
        // make sure they go into the right setup
        templates = templates.map((t) => ({ ...t, setupId }));
        const fields = ['ordinal', 'txid', 'inputs', 'outputs'];
        for (const template of templates) {
            await this.query(`UPDATE templates SET ${dollarsForUpdate(fields, 3)} WHERE setup_id = $1 AND name = $2`, [
                setupId,
                template.name,
                ...objToRow(fields, template)
            ]);
        }
    }

    public async upsertTemplates(setupId: string, templates: Template[]) {
        const names = (
            await this.query<Template>(`SELECT name FROM templates WHERE setup_id = $1`, [setupId])
        ).rows.map((row) => row[0]);
        const toInsert = templates.filter((t) => !names.find((name) => name == t.name));
        const toUpdate = templates.filter((t) => names.find((name) => name == t.name));
        await this.insertTemplates(setupId, toInsert);
        await this.updateTemplates(setupId, toUpdate);
    }

    public async markTemplateToSend(setupId: string, templateName: string, data?: Buffer[][]) {
        console.log(setupId, templateName, 'DATA', data ?? []);

        await this.query(
            `UPDATE templates
                SET updated_at = NOW(), protocol_data = $1, status = $2
                WHERE setup_id = $3 AND name = $4`,
            [
                data ? data.map((data) => data.map((buffer) => `Buffer:${buffer.toString('hex')}`)) : null,
                TemplateStatus.READY,
                setupId,
                templateName
            ]
        );
    }

    public async getReceivedTransactions(setupId: string): Promise<ReceivedTransaction[]> {
        const rows = (
            await this.query<ReceivedTransaction>(
                `SELECT template_id, block_height, raw_transaction, block_hash
                    FROM received, templates
                    WHERE received.template_id = templates.id
                    AND templates.setup_id = $1
                ORDER BY block_height, index_in_block ASC`,
                [setupId]
            )
        ).rows;
        if (rows.length == 0) throw new Error(`No received transactions found, setupId: ${setupId}`);
        return rows.map((row) => {
            const [templateId, height, raw, blockHash] = row;
            return { templateId, height, raw, blockHash };
        });
    }

    public async markReceived(
        setupId: string,
        templateName: string,
        txid: string,
        blockHash: string,
        blockHeight: number,
        rawTransaction: RawTransaction,
        indexInBlock: number = 0
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
                INSERT INTO received (template_id, txid, block_hash, block_height, raw_transaction, index_in_block)
                VALUES ((SELECT id FROM templates WHERE setup_id = $1 AND name = $2), $3, $4, $5, $6, $7)
            `,
            [
                setupId,
                templateName,
                txid,
                blockHash,
                blockHeight,
                jsonParseCustom(JSON.stringify(rawTransaction)),
                indexInBlock
            ]
        );
    }

    // To assist debugging and mocking the DB in tests.
    public async query<Row>(sql: string, params?: QueryArgs) {
        if (process.env.DEBUG_SQL) console.log(`${this.database} sql: ${sql}`, params);
        return super.query<Row>(sql, params);
    }
}
