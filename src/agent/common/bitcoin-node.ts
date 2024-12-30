import { agentConf } from '../agent.conf';
import Client, { RawTransaction } from 'bitcoin-core';

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

async function main() {
    const node = new BitcoinNode();

    const bestHash = await node.client.getBestBlockHash();
    await node.client.getBlock(bestHash, 2).then((block) => {
        const testTx = (block.tx as RawTransaction[])[2000].txid;
        for (const [index, tx] of (block.tx as RawTransaction[]).entries()) {
            if (tx.vin[0].txid === testTx) {
                console.log('nested search:', index, tx.txid, tx.vin.length, tx.vin[0].txid);
                break;
            }
        }
    });
}

if (require.main === module) {
    main();
}
