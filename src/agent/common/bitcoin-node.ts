import { agentConf } from '../agent.conf';
import Client from 'bitcoin-core';

export enum BitcoinNetwork {
    TESTNET = 'testnet',
    REGTEST = 'regtest'
}
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

if (require.main === module) {
    const node = new BitcoinNode();
    node.getBlockCount().then(console.log);
    node.client.getBestBlockHash().then(console.log);
    node.client.command('getnetworkinfo').then(console.log);
}
