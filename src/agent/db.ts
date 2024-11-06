import { AgentRoles, jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';
import { agentConf } from './agent.conf';
import { TxRawData } from './bitcoin-node';

/// DB UTILS


function jsonizeObject(obj: any): any {
    const json = jsonStringifyCustom(obj);
    return JSON.parse(json);
}

function unjsonizeObject(obj: any): any {
    const json = JSON.stringify(obj);
    return jsonParseCustom(json);
}

async function getConnection(): Promise<Client> {
    return await connect({
        user: agentConf.postgresUser,
        host: agentConf.postgresHost,
        port: agentConf.postgresPort,
        password: agentConf.postgresPassword,
        bigints: agentConf.postgresBigints,
        keepAlive: agentConf.postgresKeepAlive
    });
}


async function runQuery(sql: string, params: any[] = []) {
    const client = await getConnection();
    try {
        console.log('running query:', sql, params);
        const result = await client.query(sql, params);
        return result;
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

async function runDBTransaction(queries: [string, any[]][]) {
    const client = await getConnection();
    try {
        await client.query('BEGIN');
        for (const [sql, params] of queries) {
            await client.query(sql, params);
        }
        await client.query('COMMIT');
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}


/// NEED TO CHANGE

export enum SetupStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    SIGNED = 'SIGNED',
    FAILED = 'FAILED',
}

export enum OutgoingStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    PUBLISHED = 'PUBLISHED',
    REJECTED = 'REJECTED',
}


// export interface Outgoing {
//     transaction_id: string;
//     template_id: number;
//     raw_tx: any;
//     data: any;
//     status: OutgoingStatus;
//     timestamp: string;
// }

export interface Incoming {
    txId: string;
    templateId: number;
    rawTransaction: any;
    blockHeight: number;
};

// export interface Templates {
//     template_id: number;
//     name: string;
//     setup_id: string;
//     agent_id: string;
//     role: AgentRoles;
//     is_external: boolean
//     ordinal: number;
//     object: any;
// };

//protocolVersion could be fetched from the agent.conf
export async function writeSetupStatus(setupId: string, status: SetupStatus) {
    const result = await runQuery(
        `INSERT INTO setups
            (setup_id, status, protocol_version) VALUES ($1, $2::TEXT::setup_status, $3)
        ON CONFLICT(setup_id) DO
            UPDATE SET status = $2::TEXT::setup_status`,
        [setupId, status, agentConf.protocolVersion]
    );
}

//for testing purposes
export async function dev_ClearTemplates(agentId: string, setupId: string) {
    await runQuery(
        `delete from templates where agent_id = $1 AND setup_id = $2`,
        [agentId, setupId]
    );
}

export async function writeTransaction(agentId: string, agentRole: AgentRoles, setupId: string, transaction: Transaction) {
    const jsonizedObject = jsonizeObject(transaction);
    const result = await runQuery(
        `INSERT INTO templates
            (name, setup_id, agent_id, role, is_external, ordinal, object)
        VALUES ($1, $2, $3, $4::TEXT::role, $5, $6, $7)
        ON CONFLICT(agent_id, setup_id , name) DO UPDATE SET
            object = $7`,
        [transaction.transactionName, setupId, agentId, transaction.role,
        transaction.role !== agentRole, transaction.ordinal, jsonizedObject]
    );
}

export async function writeTransactions(agentId: string, agentRole: AgentRoles, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTransaction(agentId, agentRole, setupId, t);
}

export async function readTransactions(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(`
        SELECT * FROM templates
        WHERE
            agent_id = $1 ` + (setupId ? ` AND setup_id = $2` : '') +
        ` ORDER BY ordinal ASC `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map(r => unjsonizeObject(r['object']));
}

export async function readPendingTransactions() {
    const result = await runQuery(`
        SELECT transaction_id, template_id
        FROM outgoing
        WHERE status in ( 'PENDING', 'PUBLISHED' )
        and transaction_id not in (
            SELECT transaction_id
            FROM incoming )`
    );

    return result.rows.map(row => ({ txId: row[0], templateId: row[1] }));
}


export async function writeTransmittedTransaction(transmittedRaw: TxRawData, blockHeight: number, templateId: number) {
    const result = await runQuery(
        `INSERT INTO incoming(
	        transaction_id, template_id, raw_tx, block_height)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT(transaction_id) DO NOTHING`,
        [transmittedRaw.txid,
            templateId,
        jsonizeObject(transmittedRaw),
            blockHeight]
    );
}

export async function readTransmittedTransactions(setupId: string): Promise<Incoming[]> {
    const result = await runQuery(`
        SELECT incoming.transaction_id, template_id, block_height, raw_tx, updated
        FROM incoming INNER JOIN templates
        ON incoming.template_id = templates.template_id
        WHERE templates.setup_id = $1
    `, [setupId]);
    return result.rows.map(row => ({
        txId: row[0],
        templateId: row[1],
        blockHeight: row[2],
        rawTransaction: unjsonizeObject(row[3])
    }));
}

if (__filename === process.argv[1]) {
    (async () => {
        console.log('clearing transactions...');
    })();
}
