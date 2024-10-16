import { jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';
import { agentConf } from './agent.conf';
import { TxData, TxRawData } from './bitcoin-node';

export enum SetupStatus {
    preparing = 'preparing',
    active = 'active',
    completed = 'completed',
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
                "setupId" character varying NOT NULL,
                "status" character varying NOT NULL,
                CONSTRAINT setup_pkey PRIMARY KEY ("setupId")
            );`, []);

        await client.query(
            `CREATE TABLE IF NOT EXISTS public.transaction_templates
            (
                "agentId" character varying NOT NULL,
                "setupId" character varying NOT NULL,
                name character varying NOT NULL,
                object json NOT NULL,
                "txId" character varying,
                ordinal integer,
                CONSTRAINT transaction_template_pkey PRIMARY KEY ("agentId", "setupId", name)
            );`, []);

        await client.query(
            `CREATE TABLE IF NOT EXISTS public.transmitted_transactions
            (
                "setupId" character varying NOT NULL,
                "txId" character varying NOT NULL,
                "blockHeight" character varying NOT NULL,
                "transaction" jsonb NOT NULL,
                "rawTransaction" jsonb NOT NULL,
                CONSTRAINT transmitted_transaction_pkey PRIMARY KEY ("txId")
            );`,
            []
        );

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

export async function writeTransaction(agentId: string, setupId: string, transaction: Transaction) {
    const jsonizedObject = jsonizeObject(transaction);
    const result = await runQuery(
        `insert into "transaction_templates"
            ("agentId", "setupId", "name", "ordinal", "txId", "object")
        values ($1, $2, $3, $4, $5, $6)
        ON CONFLICT("agentId", "setupId", "name") DO UPDATE SET
            "ordinal" = $4,
            "txId" = $5,
            "object" = $6`,
        [agentId, setupId, transaction.transactionName, transaction.ordinal, transaction.txId ?? '', jsonizedObject]
    );
}

export async function writeTransactions(agentId: string, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTransaction(agentId, setupId, t);
}

export async function readTransactionByName(agentId: string, setupId: string, transactionName: string): Promise<Transaction> {
    const result = await runQuery(
        `select * from transaction_templates where
            "agentId" = $1 AND
            "setupId" = $2 AND
            "name" = $3`,
        [agentId, setupId, transactionName]
    );
    const results = [...result];
    if (results.length == 0)
        throw new Error('Transaction not found');

    return unjsonizeObject(results[0].get('object'));
}

export async function readTransactionByTxId(agentId: string, txId: string): Promise<Transaction> {
    const result = await runQuery(
        `select * from transaction_templates where
            "agentId" = $1 AND
            "txId" = $2`,
        [agentId, txId]
    );
    const results = [...result];
    if (results.length == 0)
        throw new Error('Transaction not found');
    return unjsonizeObject(results[0].get('object'));
}


export async function readTransactions(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(
        `select * from transaction_templates where
            "agentId" = $1 ` + (setupId ? ` AND "setupId" = $2` : '') +
        ` order by ordinal asc `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map(r => unjsonizeObject(r['object']));
}

export async function readPendingTransactions() {
    const result = await runQuery(`
        select distinct "tmp"."setupId", "tmp"."txId"
        from setups
            inner join
        transaction_templates as "tmp"
            on "setups"."setupId" = "tmp"."setupId"
            and "status" = '${SetupStatus.active}'
            left join
        transmitted_transactions as "trns"
            on "tmp"."txId" = "trns"."txId"
        where "trns"."txId" is null`
    );

    const results = result.rows.map(row => ({ setupId: row[0], txId: row[1] }));
    return results;
}

export async function writeSetupStatus(setupId: string, status: SetupStatus) {
    const result = await runQuery(
        `insert into "setups"
            ("setupId", "status") values ($1, $2)
        ON CONFLICT("setupId") DO
            update set "status" = $2`,
        [setupId, status]
    );
}

export async function writeTransmittedTransactions(transmitted: [TxData, TxRawData][]) {
    for (const [t, tRaw] of transmitted) await writeTransmittedTransaction(t, tRaw);
}

export async function writeTransmittedTransaction(transmitted: TxData, transmittedRaw: TxRawData) {
    const result = await runQuery(
        `insert into "transmitted_transactions"
            ("txId", "setupId", "blockHeight", "transaction", "rawTransaction")
        values ($1, $2, $3, $4, $5)
        ON CONFLICT("txId") DO NOTHING`,
        [transmitted.txid,
        transmitted.setupId,
        transmitted.blockheight,
        jsonizeObject(transmitted),
        jsonizeObject(transmittedRaw)]
    );
}
