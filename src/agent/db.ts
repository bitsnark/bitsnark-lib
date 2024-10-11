import { jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';
import { TxData } from './transmitted';
import format from 'pg-format';

enum TABLES {
    transaction_templates = 'transaction_templates',
    transmitted_transactions = 'transmitted_transactions',
}

enum FIELDS {
    agentId = 'agentId',
    setupId = 'setupId',
    name = 'name',
    ordinal = 'ordinal',
    txId = 'txId',
    object = 'object'
}
enum TRANSMITTED_FIELDS {
    setupId = 'setupId',
    txId = 'txId',
    blockHeight = 'blockHeight',
    rawTransaction = 'rawTransaction'
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

// create tables if don't exist
async function createDb(client: Client) {
    if (tablesExistFlag) return;
    try {
        await client.query('BEGIN');
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
                "rawTransaction" json NOT NULL,
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
        user: 'postgres',
        host: 'localhost',
        port: 5432,
        password: '1234',
        bigints: true,
        keepAlive: true
    });
    await createDb(client);
    return client;
}

export async function writeTransaction(agentId: string, setupId: string, transaction: Transaction) {
    const client = await getConnection();
    const jsonizedObject = jsonizeObject(transaction);
    try {
        const result = await client.query(
            `insert into "${TABLES.transaction_templates}" (
                "${FIELDS.agentId}",
                "${FIELDS.setupId}",
                "${FIELDS.name}",
                "${FIELDS.ordinal}",
                "${FIELDS.txId}",
                "${FIELDS.object}"
            ) values (
                $1, $2, $3, $4, $5, $6
            ) ON CONFLICT("${FIELDS.agentId}", "${FIELDS.setupId}", "${FIELDS.name}") DO UPDATE SET 
             "${FIELDS.ordinal}" = $4,
             "${FIELDS.txId}" = $5,
             "${FIELDS.object}" = $6`,
            [agentId, setupId, transaction.transactionName, transaction.ordinal, transaction.txId ?? '', jsonizedObject]
        );
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

export async function writeTransactions(agentId: string, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTransaction(agentId, setupId, t);
}

export async function readTransactionByName(agentId: string, setupId: string, transactionName: string): Promise<Transaction> {
    const client = await getConnection();
    try {
        const result = await client.query(
            `select * from ${TABLES.transaction_templates} where 
                "${FIELDS.agentId}" = $1 AND
                "${FIELDS.setupId}" = $2 AND
                "${FIELDS.name}" = $3`,
            [agentId, setupId, transactionName]
        );
        const results = [...result];
        if (results.length == 0)
            throw new Error('Transaction not found');
        return unjsonizeObject(results[0].get(FIELDS.object));

    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

export async function readTransactionByTxId(agentId: string, txId: string): Promise<Transaction> {
    const client = await getConnection();
    try {
        const result = await client.query(
            `select * from ${TABLES.transaction_templates} where 
                "${FIELDS.agentId}" = $1 AND
                "${FIELDS.txId}" = $3`,
            [agentId, txId]
        );
        const results = [...result];
        if (results.length == 0)
            throw new Error('Transaction not found');
        return unjsonizeObject(results[0].get(FIELDS.object));

    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

export async function readTransactions(agentId: string, setupId?: string): Promise<Transaction[]> {
    const client = await getConnection();
    try {
        const result = await client.query(
            `select * from ${TABLES.transaction_templates} where 
                "${FIELDS.agentId}" = $1 ` + (setupId ? ` AND "${FIELDS.setupId}" = $2` : '') +
            ` order by ordinal asc `,
            [agentId, setupId]
        );
        const results = [...result];
        return results.map(r => unjsonizeObject(r[FIELDS.object]));
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

export async function writeTransmittedTransactions(transmitted: TxData[]) {
    const client = await getConnection();
    try {
        const values = transmitted.map((t) =>
            [t.setupId, t.txid, t.status.block_height, jsonizeObject(t)]);

        const sql = format(
            `insert into "${TABLES.transmitted_transactions}" (
            "${TRANSMITTED_FIELDS.setupId}",
            "${TRANSMITTED_FIELDS.txId}",
            "${TRANSMITTED_FIELDS.blockHeight}",
            "${TRANSMITTED_FIELDS.rawTransaction}") 
        values %L`, values);

        const result = await client.query(sql);

    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}


export async function readPendingTransactions() {
    const client = await getConnection();
    try {
        const result = await client.query(
            `select  "${FIELDS.setupId}" , "${FIELDS.txId}" 
                from ${TABLES.transaction_templates} where 
                 "${FIELDS.txId}" not in (
                    select  "${TRANSMITTED_FIELDS.txId}" 
                    from ${TABLES.transmitted_transactions})`);

        const results = result.rows.map(row => ({ setupId: row[0], txid: row[1] }));
        return results;
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}
