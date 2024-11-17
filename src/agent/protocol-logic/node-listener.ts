import { readExpectedIncoming, updatedSetupListenerLastHeight, writeIncomingTransaction } from '../common/db';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
const checkNodeInterval = 60000;

export class BitcoinNodeListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastCrawledHeight: number = 0;
    private tipHeight: number = 0;
    private tipHash: string = '';
    private isCrawling: boolean = false;
    public client;

    constructor() {
        this.client = new BitcoinNode().client;
    }


    async setMonitorSchedule() {
        this.scheduler = setInterval(async () => {
            try {
                if (this.isCrawling) return;
                this.isCrawling = true;
                await this.checkForNewBlock().catch((error) => console.error(error));
            }
            catch (error) {
                console.error(error);
            }
            finally {
                this.isCrawling = false;
            }
        }, checkNodeInterval);
        await this.checkForNewBlock();
    }


    async checkForNewBlock() {
        const tipHash = await this.client.getBestBlockHash();
        if (tipHash !== this.tipHash) {
            this.tipHeight = (await this.client.getBlock(tipHash)).height;
            console.log('New block detected:', tipHash, this.tipHeight);
            this.tipHash = tipHash;
            this.monitorTransmitted();
        }
    }

    async monitorTransmitted() {
        let pending = await readExpectedIncoming();
        if (pending.length === 0) return;

        this.lastCrawledHeight = pending[0].listenerBlockHeight

        while (this.lastCrawledHeight < this.tipHeight - agentConf.blocksUntilFinalized && pending.length > 0) {
            const pendingTxIdsSet = new Set(
                pending.filter((tx) => tx.listenerBlockHeight === this.lastCrawledHeight)
                    .map((tx) => tx.txId));

            const blockHeight = this.lastCrawledHeight + 1;
            const blockHash = blockHeight === this.tipHeight ? this.tipHash : await this.client.getBlockHash(blockHeight);

            const blockTxs = (await this.client.getBlock(blockHash)).tx;
            const transmittedTxIds = blockTxs.filter((tx) => pendingTxIdsSet.has(tx));

            for (const txId of transmittedTxIds) {
                const transmittedTx: RawTransaction = await this.client.getRawTransaction(txId, true, blockHash);
                await writeIncomingTransaction(transmittedTx, blockHeight, pending.find((tx) => tx.txId === txId)!.templateId);
            }

            updatedSetupListenerLastHeight(this.lastCrawledHeight, blockHeight);

            pending = pending.reduce((acc, tx) => {
                if (!transmittedTxIds.includes(tx.txId)) {
                    if (tx.listenerBlockHeight === this.lastCrawledHeight) {
                        acc.push({ ...tx, listenerBlockHeight: blockHeight });
                    } else {
                        acc.push(tx);
                    }
                }
                return acc;
            }, [] as typeof pending);

            this.lastCrawledHeight = blockHeight;
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
        const nodeListener = new BitcoinNodeListener();

        await nodeListener.checkForNewBlock();
        nodeListener.destroy();

        const client = new BitcoinNode().client;
        await client.getRawTransaction('be71a3bb8fd7c1631a68ecc48f436cfd29f640f6b89edb7b6ecaec54957cf989', true, '').then(console.log);
    })().catch(console.error);
}
