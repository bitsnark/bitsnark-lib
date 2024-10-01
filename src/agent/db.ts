import { jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';

enum TABLES {
    transaction_templates = 'transaction_templates',
}

enum FIELDS {
    agentId = 'agentId',
    setupId = 'setupId',
    name = 'name',
    ordinal = 'ordinal',
    txId = 'txId',
    object = 'object'
}

function jsonizeObject(obj: any): any {
    const json = jsonStringifyCustom(obj);
    return JSON.parse(json);
}

function unjsonizeObject(obj: any): any {
    const json = JSON.stringify(obj);
    return jsonParseCustom(json);
}

async function getConnection(): Promise<Client> {
    const client = await connect({
        user: 'postgres',
        host: 'localhost',
        port: undefined,
        password: '1234',
        bigints: true,
        keepAlive: true
    });
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
            [agentId, setupId, transaction.transactionName, transaction.ordinal, transaction.txId, jsonizedObject]
        );
    } catch (e) {
        console.error(e);
        throw e;
    } finally {
        await client.end();
    }
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
        console.error(e);
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
        console.error(e);
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
                "${FIELDS.agentId}" = $1 ` + (setupId ? ` AND "${FIELDS.setupId}" = $2` : ''),
            [agentId, setupId]
        );
        const results = [...result];
        return results.map(r => unjsonizeObject(r[FIELDS.object]));

    } catch (e) {
        console.error(e);
        throw e;
    } finally {
        await client.end();
    }
}
