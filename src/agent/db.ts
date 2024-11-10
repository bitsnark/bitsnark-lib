import { AgentRoles, jsonParseCustom, jsonStringifyCustom } from './common';
import { Transaction } from './transactions-new';
import { Client, connect } from 'ts-postgres';
import { agentConf } from './agent.conf';
import { TxRawData } from './bitcoin-node';

// DB utils
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
        const result = await client.query(sql, params);
        return result;
    } catch (e) {
        console.error((e as any).message);
        throw e;
    } finally {
        await client.end();
    }
}

async function runDBTransaction(queries: [string, (string | number | boolean)[]][]) {
    const client = await getConnection();
    try {
        await client.query('BEGIN');
        for (const [sql, params] of queries) {
            await client.query(sql, params as any);
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
export interface Outgoing {
    transaction_id: string;
    template_id: number;
    raw_tx: any;
    data: any;
    status: OutgoingStatus;
    timestamp: string;
}
export interface Incoming {
    txId: string;
    templateId: number;
    rawTransaction: any;
    blockHeight: number;
};
export interface Templates {
    template_id: number;
    name: string;
    setup_id: string;
    agent_id: string;
    role: AgentRoles;
    is_external: boolean
    ordinal: number;
    object: any;
};

// DB functions
// used for our code testing (delete setup data)
export async function dev_ClearTemplates(setupId: string, agentId?: string) {
    //delete all outgoing, incoming and templates
    const params = agentId ? [setupId, agentId] : [setupId];
    await runDBTransaction([
        [`delete from outgoing where template_id in (
            select template_id from templates where setup_id = $1 ` +
            (agentId ? ` AND agent_id = $2` : '') + `);`,
            params],
        [`delete from incoming where template_id in (
            select template_id from templates where setup_id = $1 ` +
            (agentId ? ` AND agent_id = $2` : '') + `);`,
            params],
        [`delete from templates where setup_id = $1 ` +
            (agentId ? ` AND agent_id = $2` : '') + `;`,
            params]
    ]);
}

export async function writeSetupStatus(setupId: string, status: SetupStatus) {
    const result = await runQuery(
        `INSERT INTO setups
            (setup_id, status, protocol_version) VALUES ($1, $2::TEXT::setup_status, $3)
        ON CONFLICT(setup_id) DO
            UPDATE SET status = $2::TEXT::setup_status`,
        [setupId, status, agentConf.protocolVersion]
    );
}

export async function writeTemplate(agentId: string, setupId: string, transaction: Transaction) {
    const jsonizedObject = jsonizeObject(transaction);
    const result = await runQuery(
        `INSERT INTO templates
            (name, setup_id, agent_id, role, is_external, ordinal, object)
        VALUES ($1, $2, $3, $4::TEXT::role, $5, $6, $7)
        ON CONFLICT(agent_id, setup_id , name) DO UPDATE SET
            object = $7`,
        [transaction.transactionName, setupId, agentId, transaction.role,
        transaction?.external ?? false, transaction.ordinal, jsonizedObject]
    );
}

export async function writeTemplates(agentId: string, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTemplate(agentId, setupId, t);
}

export async function readTemplates(agentId: string, setupId?: string): Promise<Transaction[]> {
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

export async function readTemplatesOfOutging(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(`
        SELECT templates.*, outgoing.transaction_id FROM templates
        INNER JOIN outgoing
        ON templates.template_id = outgoing.template_id
        WHERE
            agent_id = $1 ` + (setupId ? ` AND setup_id = $2` : '') +
        ` ORDER BY ordinal ASC `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map(r => unjsonizeObject(r['object']));
}

export async function readExpectedIncoming() {
    const result = await runQuery(`
        SELECT outgoing.transaction_id, outgoing.template_id
        FROM outgoing INNER JOIN templates
        ON outgoing.template_id = templates.template_id
        INNER JOIN setups
        ON templates.setup_id = setups.setup_id
        WHERE outgoing.status in ( 'PENDING', 'PUBLISHED' )
        and setups.status = 'SIGNED'
        and transaction_id not in (
            SELECT transaction_id
            FROM incoming )`
    );

    return result.rows.map(row => ({ txId: row[0], templateId: row[1] }));
}

export async function writeIncomingTransaction(transmittedRaw: TxRawData, blockHeight: number, templateId: number) {
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

export async function readIncomingTransactions(setupId: string): Promise<Incoming[]> {
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

if (process.argv[1] == __filename) {
    (async () => {
        await dev_ClearTemplates('test_setup');
    })().catch(console.error);
}
