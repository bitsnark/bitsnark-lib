import { readExpectedIncoming, writeIncomingTransaction } from './db';
import { agentConf } from './agent.conf';
import { BitcoinNode, TxData, TxRawData } from './bitcoin-node';

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
                const transmittedTx: TxData = await this.client.getTransaction(pendingTx.txId);
                if (
                    transmittedTx &&
                    this.lastBlockHeight - transmittedTx.blockheight >= agentConf.blocksUntilFinalized
                ) {
                    const transmittedRawTx: TxRawData = await this.client.getRawTransaction(
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
