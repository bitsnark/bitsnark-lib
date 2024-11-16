import { agentConf } from "./agent.conf";
import Client from 'bitcoin-core';

export class BitcoinNode {
    public client;

    constructor() {
        this.client = new Client({
            network: agentConf.bitcoinNodeNetwork,
            username: agentConf.bitcoinNodeUsername,
            password: agentConf.bitcoinNodePassword,
            host: agentConf.bitcoinNodeHost,
            port: agentConf.bitcoinNodePort
        });
    }

    async getBlockCount() {
        return await this.client.getBlockCount();
    }
}
