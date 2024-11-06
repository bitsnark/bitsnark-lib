import { readPendingTransactions, writeTransmittedTransaction } from './db';
import { agentConf } from './agent.conf';
import { BitcoinNode, TxRawData } from './bitcoin-node';

const checkNodeInterval = 60000;

export class NodeListener {
    private scheduler: NodeJS.Timeout | null = null;
    private lastBlockHeight: number = 0;
    private lastBlockHash: string = '';
    public client

    constructor() {
        this.client = new BitcoinNode().client
    }

    async setMonitorSchedule() {
        this.scheduler = setInterval(() => {
            this.checkForNewBlock().catch(error => console.error(error));
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
        const pending = await readPendingTransactions();
        for (const pendingTx of pending) {
            try {
                const rawTx: TxRawData = await this.client.getRawTransaction(pendingTx.txId, true);
                if (rawTx && rawTx.confirmations >= agentConf.blocksUntilFinalized) {
                    const block = await this.client.getBlock(rawTx.blockhash);
                    writeTransmittedTransaction(rawTx, block.blockheight, pendingTx.templateId);
                }
            } catch (error) { continue }
        }
    }

    destroy() {
        if (this.scheduler) {
            clearInterval(this.scheduler);
            this.scheduler = null;
        }
    }
}
