import { jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';
import { agentConf } from './agent.conf';
import { TxData, TxRawData } from './bitcoin-node';

export enum SetupStatus {
    preparing = 'preparing',
    active = 'active',
    used = 'used',
}

export interface TransmittedTransaction {
    txId: string;
    blockHeight: number;
    transaction: string;
    rawTransaction: string;
}

function jsonizeObject(obj: any): any {
    const json = jsonStringifyCustom(obj);
    return JSON.parse(json);
}

function unjsonizeObject(obj: any): any {
    const json = JSON.stringify(obj);
    return jsonParseCustom(json);
}

let tablesExistFlag = false;

async function createDb(client: Client) {
    if (tablesExistFlag) return;
    try {
        await client.query('BEGIN');

        await client.query(
            `CREATE TABLE IF NOT EXISTS public.setups
                (
                    setup_id CHARACTER VARYING NOT NULL,
                    status CHARACTER VARYING NOT NULL,
                    CONSTRAINT setup_pkey PRIMARY KEY (setup_id)
                );`, []);

        await client.query(
            `CREATE TABLE IF NOT EXISTS public.transaction_templates
                (
                    agent_id CHARACTER VARYING NOT NULL,
                    setup_id CHARACTER VARYING NOT NULL,
                    ordinal INTEGER,
                    name CHARACTER VARYING NOT NULL,
                    object JSONB NOT NULL,
                    tx_id CHARACTER VARYING,
                    CONSTRAINT transaction_template_pkey PRIMARY KEY (agent_id, setup_id, name)
                );`, []);

        await client.query(
            `CREATE TABLE IF NOT EXISTS public.transmitted_transactions
                (
                    setup_id CHARACTER VARYING NOT NULL,
                    tx_id CHARACTER VARYING NOT NULL,
                    block_height CHARACTER VARYING NOT NULL,
                    transaction JSONB NOT NULL,
                    raw_transaction JSONB NOT NULL,
                    CONSTRAINT transmitted_transaction_pkey PRIMARY KEY (tx_id)
                );`, []);

        await client.query('COMMIT');
        tablesExistFlag = true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error((e as any).message);
        throw e;
    }
}

async function getConnection(): Promise<Client> {
    const client = await connect({
        user: agentConf.postgresUser,
        host: agentConf.postgresHost,
        port: agentConf.postgresPort,
        password: agentConf.postgresPassword,
        bigints: agentConf.postgresBigints,
        keepAlive: agentConf.postgresKeepAlive
    });
    await createDb(client);
    return client;
}

async function runQuery(sql: string, params: any[] = []) {
    const client = await getConnection();
    try {
        const result = await client.query(sql, params);
        return result;
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

export async function clearTransactions(agentId: string, setupId: string) {
    await runQuery(
        `delete from transaction_templates where agent_id = $1 AND setup_id = $2`,
        [agentId, setupId]
    );
}

export async function writeTransaction(agentId: string, setupId: string, transaction: Transaction) {
    const jsonizedObject = jsonizeObject(transaction);
    const result = await runQuery(
        `INSERT INTO transaction_templates
            (agent_id, setup_id , name, ordinal, tx_id, object)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(agent_id, setup_id , name) DO UPDATE SET
            ordinal = $4,
            tx_id = $5,
            object = $6`,
        [agentId, setupId, transaction.transactionName, transaction.ordinal, transaction.txId ?? '', jsonizedObject]
    );
}

export async function writeTransactions(agentId: string, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTransaction(agentId, setupId, t);
}

export async function readTransactionByName(agentId: string, setupId: string, transactionName: string): Promise<Transaction> {
    const result = await runQuery(
        `SELECT * FROM transaction_templates WHERE
            agent_id = $1 AND
            setup_id = $2 AND
            name = $3`,
        [agentId, setupId, transactionName]
    );
    const results = [...result];
    if (results.length == 0)
        throw new Error('Transaction not found');

    return unjsonizeObject(results[0].get('object'));
}

export async function readTransactionByTxId(agentId: string, txId: string): Promise<Transaction> {
    const result = await runQuery(
        `SELECT * FROM transaction_templates WHERE
            agent_id = $1 AND
            tx_id = $2`,
        [agentId, txId]
    );
    const results = [...result];
    if (results.length == 0)
        throw new Error('Transaction not found');
    return unjsonizeObject(results[0].get('object'));
}

export async function readTransactions(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(
        `SELECT * FROM transaction_templates WHERE
            agent_id = $1 ` + (setupId ? ` AND setup_id = $2` : '') +
        ` ORDER BY ordinal ASC `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map(r => unjsonizeObject(r['object']));
}

export async function readPendingTransactions() {
    const result = await runQuery(`
        SELECT DISTINCT templates.setup_id, templates.name, templates.tx_id
        FROM setups
            INNER JOIN
        transaction_templates AS templates
            ON setups.setup_id = templates.setup_id
            AND status = '${SetupStatus.active}'
            LEFT JOIN
        transmitted_transactions AS trns
            ON templates.tx_id = trns.tx_id
        WHERE trns.tx_id IS NULL`
    );

    const results = result.rows.map(row => ({ setupId: row[0], transactionName: row[1], txId: row[2] }));
    return results;
}

export async function writeSetupStatus(setupId: string, status: SetupStatus) {
    const result = await runQuery(
        `INSERT INTO setups
            (setup_id, status) VALUES ($1, $2)
        ON CONFLICT(setup_id) DO
            UPDATE SET status = $2`,
        [setupId, status]
    );
}

export async function writeTransmittedTransaction(transmitted: TxData, transmittedRaw: TxRawData) {
    const result = await runQuery(
        `INSERT INTO transmitted_transactions
            (tx_id, setup_id, block_height, transaction, raw_transaction
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT(tx_id) DO NOTHING`,
        [transmitted.txid,
        transmitted.setupId,
        transmitted.blockheight,
        jsonizeObject(transmitted),
        jsonizeObject(transmittedRaw)]
    );
}

export async function readTransmittedTransactions(setupId: string): Promise<TransmittedTransaction[]> {
    const result = await runQuery(`
        SELECT tx_id, block_height, transaction, raw_transaction
        FROM transmitted_transactions
        WHERE setup_id = $1
    `, [setupId]);
    return result.rows.map(row => ({
        txId: row[0],
        blockHeight: row[1],
        transaction: unjsonizeObject(row[2]),
        rawTransaction: unjsonizeObject(row[3])
    }));
}
