import { readExpectedIncoming, writeIncomingTransaction } from '../common/db';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction, TransactionData } from 'bitcoin-core';

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
                const transmittedTx: TransactionData = await this.client.getTransaction(pendingTx.txId);
                if (
                    transmittedTx &&
                    this.lastBlockHeight - transmittedTx.blockheight >= agentConf.blocksUntilFinalized
                ) {
                    const transmittedRawTx: RawTransaction = await this.client.getRawTransaction(
                        pendingTx.txId,
                        true,
                        transmittedTx.blockhash
                    );
                    await writeIncomingTransaction(transmittedRawTx, transmittedTx.blockheight, pendingTx.templateId);
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

if (require.main === module) {
    const listener = new NodeListener();
    listener.checkForNewBlock();
    listener.destroy();
}
