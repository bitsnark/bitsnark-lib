import { connect } from 'ts-postgres';
import { agentConf } from '../agent.conf';

export type DbValue = string | number | boolean | object | null | undefined;
export type QueryArgs = DbValue[];
export interface Query {
    sql: string;
    args: QueryArgs;
}

export class Db {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;

    constructor(database: string = 'postgres') {
        this.host = agentConf.postgresHost;
        this.port = Number(agentConf.postgresPort);
        this.user = agentConf.postgresUser;
        this.password = agentConf.postgresPassword;
        this.database = database;
    }

    protected async connect() {
        return await connect({
            user: this.user,
            host: this.host,
            port: this.port,
            password: this.password,
            database: this.database,
            bigints: true,
            keepAlive: agentConf.postgresKeepAlive
        });
    }

    protected async query<Row>(sql: string, params?: QueryArgs) {
        // Re-creating the client for each query.
        const client = await this.connect();
        try {
            return await client.query<Row>(sql, params ?? []);
        } catch (error) {
            console.error('Failed to execute query: ', (error as { message: string }).message ?? '');
            console.error('SQL: ', sql);
            console.error('params: ', params);
            throw error;
        } finally {
            await client.end();
        }
    }
}
