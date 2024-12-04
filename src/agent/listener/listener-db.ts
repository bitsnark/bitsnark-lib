import { ResultRow, ResultRecord } from 'ts-postgres';
import { RawTransaction } from 'bitcoin-core';
import { Setup, SetupStatus, Template } from '../common/types';
import { jsonParseCustom } from '../common/json';
import { AgentDb } from '../common/agent-db';

export interface Received {
    actualTxid: string;
    blockHash?: string;
    blockHeight?: number;
    rawTransaction?: RawTransaction;
}

// Template row, with optional received fields and setup data.
export interface ReceivedTemplate extends Template, Received, Omit<Setup, 'id' | 'status' | 'wotsSalt'> {
    setupId: string;
    setupStatus: SetupStatus;
}

// Setup row, with templates and received templates.
export interface ReceivedSetup extends Setup {
    templates: Template[];
    received: ReceivedTemplate[];
}

export class ListenerDb extends AgentDb {
    private static templateFields = `
        templates.name, templates.role, templates.is_external, templates.ordinal, 
        templates.inputs, templates.outputs,
        received.txid, received.raw_transaction, received.block_hash, received.block_height,
        setups.id, setups.protocol_version,
        setups.status, setups.last_checked_block_height`;

    private static receivedTemplateReader(row: ResultRow<ResultRecord>): ReceivedTemplate {
        let i = 0;
        return {
            name: row[i++],
            role: row[i++],
            isExternal: row[i++],
            ordinal: row[i++],
            inputs: jsonParseCustom(JSON.stringify(row[i++])),
            outputs: jsonParseCustom(JSON.stringify(row[i++])),
            actualTxid: row[i++],
            rawTransaction: row[i++],
            blockHash: row[i++],
            blockHeight: row[i++],
            setupId: row[i++],
            protocolVersion: row[i++],
            setupStatus: row[i++],
            lastCheckedBlockHeight: row[i++]
        };
    }

    constructor(agentId: string) {
        super(agentId);
    }

    public async markReceived(
        setupId: string,
        transactionName: string,
        txid: string,
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
            [setupId, transactionName, txid, blockHash, blockHeight, JSON.stringify(rawTransaction)]
        );
    }

    public async getReceivedTemplates(setupId?: string): Promise<ReceivedTemplate[]> {
        const setupFilter = setupId ? 'WHERE setups.id = $1' : '';
        const result = await this.query<ReceivedTemplate>(
                `
                    SELECT ${ListenerDb.templateFields}
                    FROM templates
                    JOIN setups ON templates.setup_id = setups.id
                    LEFT JOIN received ON templates.id = received.template_id
                    ${setupFilter}
                    ORDER BY last_checked_block_height ASC, ordinal ASC
                `,
                [setupId]
            );
        return result.rows
            .map(ListenerDb.receivedTemplateReader);
    }

    public async getReceivedSetups(setupId: string): Promise<ReceivedSetup> {
        const templates = await this.getTemplates(setupId);
        const received = await this.getReceivedTemplates(setupId);
        const setup = (
            await this.query<ReceivedSetup>(
                `
                    SELECT 
                    id, protocol_version, status, last_checked_block_height, wots_salt
                    payload_txid, payload_output_index, payload_amount,
                    stake_txid, stake_output_index, stake_amount
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
}
