import { connect } from 'ts-postgres';
import { agentConf } from '../agent.conf';

export type DbValue = string | number | boolean | object | null | undefined;
export type QueryArgs = DbValue[];
interface Query {
    sql: string;
    args?: QueryArgs;
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
            console.error('Failed to execute query:', sql, params);
            throw error;
        } finally {
            await client.end();
        }
    }

    protected async session(queries: Query[]): Promise<void> {
        this.query('BEGIN');
        try {
            for (const query of queries) {
                await this.query(query.sql, query.args);
            }
        } catch (error) {
            this.query('ROLLBACK');
            throw error;
        }
        this.query('COMMIT');
    }
}
