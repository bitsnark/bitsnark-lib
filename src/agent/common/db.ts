/* eslint-disable @typescript-eslint/no-explicit-any */
/*
Since client.query accepts any as a parameter and also returns any, we have to disable this rule.
It could be possible to create a custom type for the query result and params, but it would be a lot of work for no real benefit,
and it would be fragile for changes.

Most of the objects passed to params are simple types, but some are parsed to any with JSON.parse, so we can't be sure of the type.
*/
import { Transaction } from '../common/transactions';
import { Client, connect } from 'ts-postgres';
import { agentConf } from '../agent.conf';
import { RawTransaction } from 'bitcoin-core';
import { jsonStringifyCustom, jsonParseCustom } from './json';
import { AgentRoles } from './types';

// DB utils
function jsonizeObject<T>(obj: T): T {
    const json = jsonStringifyCustom(obj);
    return JSON.parse(json) as T;
}

function unjsonizeObject<T>(obj: T): T {
    const json = JSON.stringify(obj);
    return jsonParseCustom(json) as T;
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
        if (e instanceof Error) {
            console.error(e.message);
        } else {
            console.error(e);
        }
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
        if (e instanceof Error) {
            console.error(e.message);
        } else {
            console.error(e);
        }
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
    PEGOUT_SUCCESSFUL = 'PEGOUT_SUCCESSFUL',
    PEGOUT_FAILED = 'PEGOUT_FAILED'
}

export enum OutgoingStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    PUBLISHED = 'PUBLISHED',
    REJECTED = 'REJECTED'
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
    name: string;
    setupId: string;
}
export interface Templates {
    template_id: number;
    name: string;
    setup_id: string;
    agent_id: string;
    role: AgentRoles;
    is_external: boolean;
    ordinal: number;
    object: any;
}

export interface Setup {
    setup_id: string;
    status: SetupStatus;
    listenerBlockHeight: number;
    protocolVersion: string;
    wotsSalt: string;
}

export interface Pending {
    txId: string;
    templateId: number;
    setupId: string;
    listenerBlockHeight: number;
    transactionName: string;
    object: any;
    protocolVersion: string;
    incomingTxId: string | null;
}

// DB functions

// This is used for development purposes only and will be removed once every agent gets his own setup.
export async function dev_ClearTemplates(setupId: string, agentId?: string) {
    //delete all outgoing, incoming and templates
    const params = agentId ? [setupId, agentId] : [setupId];
    await runDBTransaction([
        [
            `DELETE FROM outgoing WHERE template_id IN (
            SELECT template_id FROM templates WHERE setup_id = $1 ` +
                (agentId ? ` AND agent_id = $2` : '') +
                `);`,
            params
        ],
        [
            `DELETE FROM incoming WHERE template_id IN (
            SELECT template_id FROM templates WHERE setup_id = $1 ` +
                (agentId ? ` AND agent_id = $2` : '') +
                `);`,
            params
        ],
        [`DELETE FROM templates WHERE setup_id = $1 ` + (agentId ? ` AND agent_id = $2` : '') + `;`, params]
    ]);
}

export async function createSetup(setupId: string, wotsSalt: string) {
    const result = await runQuery(
        `INSERT INTO setups
            (setup_id, status, protocol_version, wots_salt) VALUES ($1, $2::TEXT::setup_status, $3, $4)`,
        [setupId, SetupStatus.PENDING, agentConf.protocolVersion, wotsSalt]
    );
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

export async function readActiveSetups(status: SetupStatus = SetupStatus.READY): Promise<Setup[]> {
    const result = await runQuery(
        `SELECT setup_id, status::TEXT, protocol_version, listener_last_crawled_height, wots_salt
        FROM setups
        WHERE status = $1::TEXT::setup_status`,
        [status]
    );
    return result.rows.map((row) => ({
        setup_id: row[0],
        status: row[1],
        protocolVersion: row[2],
        listenerBlockHeight: row[3],
        wotsSalt: row[4]
    }));
}

export async function readSetup(setupId: string): Promise<Setup> {
    const result = await runQuery(
        `SELECT setup_id, status::TEXT, protocol_version, listener_last_crawled_height, wots_salt
        FROM setups WHERE setup_id = $1`,
        [setupId]
    );
    if (result.rows.length != 1) throw new Error(`Setup not found: ${setupId}`);
    return {
        setup_id: result.rows[0][0],
        status: result.rows[0][1],
        protocolVersion: result.rows[0][2],
        listenerBlockHeight: result.rows[0][3],
        wotsSalt: result.rows[0][4]
    };
}

export async function updatedListenerHeightBySetupsIds(setupIds: string[], newCrawledHeight: number) {
    const result = await runQuery(
        `UPDATE setups
            SET listener_last_crawled_height = $1
        WHERE setup_id = ANY($2::TEXT[])`,
        [newCrawledHeight, setupIds]
    );
}

export async function writeTemplate(agentId: string, setupId: string, transaction: Transaction) {
    const jsonizedObject = jsonizeObject(transaction);
    const result = await runQuery(
        `INSERT INTO templates
        (name, setup_id, agent_id, role, is_external, ordinal, object)
        VALUES($1, $2, $3, $4:: TEXT:: role, $5, $6, $7)
        ON CONFLICT(agent_id, setup_id, name) DO UPDATE SET
            object = $7`,
        [
            transaction.transactionName,
            setupId,
            agentId,
            transaction.role,
            transaction?.external ?? false,
            transaction.ordinal,
            jsonizedObject
        ]
    );
}

export async function writeTemplates(agentId: string, setupId: string, transactions: Transaction[]) {
    for (const t of transactions) await writeTemplate(agentId, setupId, t);
}

export async function readTemplates(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(
        `
        SELECT * FROM templates
        WHERE
            agent_id = $1 ` +
            (setupId ? ` AND setup_id = $2` : '') +
            ` ORDER BY ordinal ASC `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map((r) => {
        const obj = unjsonizeObject(r['object']);
        obj.templateId = r['template_id'];
        return obj;
    });
}

export async function readTemplatesOfOutging(agentId: string, setupId?: string): Promise<Transaction[]> {
    const result = await runQuery(
        `
        SELECT templates.*, outgoing.transaction_id FROM templates
        INNER JOIN outgoing
        ON templates.template_id = outgoing.template_id
        WHERE
            agent_id = $1 ` +
            (setupId ? ` AND setup_id = $2` : '') +
            ` ORDER BY ordinal ASC `,
        [agentId, setupId]
    );
    const results = [...result];
    return results.map((r) => unjsonizeObject(r['object']));
}

export async function readOutgingByTemplateId(templateId: number): Promise<Outgoing | undefined> {
    const result = await runQuery(
        `
        SELECT * FROM outgoing
        WHERE
            template_id = $1`,
        [templateId]
    );
    const results = [...result];
    return results[0] as Outgoing;
}

export async function writeOutgoing(templateId: number, data: any, status: OutgoingStatus) {
    await runQuery(`UPDATE outgoing SET data = $1, status = $2 WHERE template_id = $3`, [data, status, templateId]);
}

export async function readExpectedIncoming(agent_id: string): Promise<Pending[]> {
    const result = await runQuery(
        `
        SELECT outgoing.transaction_id,
            outgoing.template_id,
            setups.setup_id,
            setups.listener_last_crawled_height,
            templates.name,
            templates.object,
            setups.protocol_version,
            incoming.transaction_id
        FROM outgoing
        INNER JOIN templates
            ON outgoing.template_id = templates.template_id
        INNER JOIN setups
            ON templates.setup_id = setups.setup_id
        LEFT JOIN incoming
            ON outgoing.template_id = incoming.template_id
        WHERE
            templates.agent_id = $1
            AND outgoing.status in ('PENDING', 'PUBLISHED')
            AND setups.status = 'SIGNED'
        ORDER BY
            listener_last_crawled_height,
            setups.setup_id,
            outgoing.template_id`,
        [agent_id]
    );

    return result.rows.map((row) => ({
        txId: row[0],
        templateId: row[1],
        setupId: row[2],
        listenerBlockHeight: row[3],
        transactionName: row[4],
        object: unjsonizeObject(row[5]),
        protocolVersion: row[6],
        incomingTxId: row[7]
    }));
}

export async function writeIncomingTransaction(
    transmittedRaw: RawTransaction,
    blockHeight: number,
    templateId: number
) {
    const result = await runQuery(
        `INSERT INTO incoming(
	        transaction_id, template_id, raw_tx, block_height)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING`,
        [transmittedRaw.txid, templateId, jsonizeObject(transmittedRaw), blockHeight]
    );
}

export async function readIncomingTransactions(setupId: string, agentId?: string): Promise<Incoming[]> {
    const result = await runQuery(
        `SELECT incoming.transaction_id,
            incoming.template_id,
            incoming.block_height,
            raw_tx,
            templates.name,
            templates.setup_id
        FROM incoming INNER JOIN templates
        ON incoming.template_id = templates.template_id
        WHERE templates.setup_id = $1` + (agentId ? ` AND templates.agent_id = $2` : ''),
        [setupId, agentId]
    );
    return result.rows.map((row) => ({
        txId: row[0],
        templateId: row[1],
        blockHeight: row[2],
        rawTransaction: unjsonizeObject(row[3]),
        name: row[4],
        setupId: row[5]
    }));
}
