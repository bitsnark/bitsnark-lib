import { readExpectedIncoming, writeIncomingTransaction } from '../common/db';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';

const checkNodeInterval = 60000;

export class NodeListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastBlockHeight: number = 0;
    private lastBlockHash: string = '';
    public client;

    constructor() {
        this.client = new BitcoinNode().client;
    }

    async setMonitorSchedule() {
        this.scheduler = setInterval(() => {
            this.checkForNewBlock().catch((error) => console.error(error));
        }, checkNodeInterval);

        await this.checkForNewBlock();
    }

    async checkForNewBlock() {
        const lastBlockHash = await this.client.getBestBlockHash();
        if (lastBlockHash !== this.lastBlockHash) {
            this.lastBlockHeight = (await this.client.getBlock(lastBlockHash)).height;
            console.log('New block detected:', lastBlockHash, this.lastBlockHeight);
            this.lastBlockHash = lastBlockHash;
            this.monitorTransmitted();
        }
    }

    async monitorTransmitted() {
        const pending = await readExpectedIncoming();
        for (const pendingTx of pending) {
            try {
                const transmittedTx: RawTransaction = await this.client.getRawTransaction(pendingTx.txId, true, 'temp');
                if (transmittedTx) {
                    const txBlockHeight = (await this.client.getBlock(transmittedTx.blockhash)).height;
                    if (this.lastBlockHeight - txBlockHeight >= agentConf.blocksUntilFinalized) {
                        await writeIncomingTransaction(
                            transmittedTx, txBlockHeight, pendingTx.templateId);
                    }
                }
            } catch (error) {
                continue;
            }
        }
    }

    destroy() {
        if (this.scheduler) {
            clearInterval(this.scheduler);
            this.scheduler = null;
        }
    }
}


if (process.argv[1] == __filename) {
    (async () => {
        const nodeListener = new NodeListener();
        await nodeListener.checkForNewBlock();
        nodeListener.destroy();

        const client = new BitcoinNode().client;
        await client.getRawTransaction('be71a3bb8fd7c1631a68ecc48f436cfd29f640f6b89edb7b6ecaec54957cf989', true, '').then(console.log);
    })().catch(console.error);
}
