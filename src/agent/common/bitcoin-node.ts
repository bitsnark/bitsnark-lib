import { agentConf } from '../agent.conf';
import Client from 'bitcoin-core';

export enum BitcoinNetwork {
    TESTNET = 'testnet',
    REGTEST = 'regtest',
}
export class BitcoinNode {
    public client;

    constructor(mode: BitcoinNetwork = BitcoinNetwork.REGTEST) {
        if (mode == BitcoinNetwork.REGTEST) {
            this.client = new Client({
                network: agentConf.bitcoinNodeNetwork,
                username: agentConf.bitcoinNodeUsername,
                password: agentConf.bitcoinNodePassword,
                host: agentConf.bitcoinNodeHost,
                port: agentConf.bitcoinNodePort
            });
        }
        else {
            this.client = new Client({
                network: 'testnet',
                username: 'sovtestnet',
                password: '9u7dpYWapKJFh4qy',
                host: '3.143.152.117',
                port: 18332
            });
        }
    }

    async getBlockCount() {
        return await this.client.getBlockCount();
    }
}

if (require.main === module) {
    const node = new BitcoinNode(BitcoinNetwork.TESTNET);
    node.getBlockCount().then(console.log);
    node.client.getBestBlockHash().then(console.log);
    node.client.command('getnetworkinfo').then(console.log);
}
