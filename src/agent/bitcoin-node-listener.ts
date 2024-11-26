import { Transaction } from './common/transactions';
import { agentConf } from './agent.conf';
import { BitcoinNode } from './common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
import { Pending, readExpectedIncoming, writeIncomingTransaction, updatedListenerHeightBySetupsIds } from './common/db';

const checkNodeInterval = 60000;
export interface expectByInputs {
    setupId: string;
    name: string;
    templateId: number;
    vins: { outputTxid: string; outputIndex: number; vin: number }[];
}

export class BitcoinNodeListener {
    private agentId: string;
    private tipHeight: number = 0;
    private tipHash: string = '';
    public client;

    constructor(agentId: string) {
        this.client = new BitcoinNode().client;
        this.agentId = agentId;
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

    async monitorTransmitted(): Promise<void> {
        const setupsTemplates = await readExpectedIncoming(this.agentId);
        const pending = setupsTemplates.filter((tx) => tx.incomingTxId === null);
        if (pending.length === 0) return;

        let blockHeight = pending[0].listenerBlockHeight + 1;

        // No reorganization isupport, just wait for the block to be finalized
        while (blockHeight <= this.tipHeight - agentConf.blocksUntilFinalized) {
            const blockHash = await this.client.getBlockHash(blockHeight);

            for (const pendingTx of pending) {
                try {
                    let transmittedTx: RawTransaction | undefined;
                    if (!pendingTx.object.temporaryTxId)
                        transmittedTx = await this.client.getRawTransaction(pendingTx.txId, true, blockHash);
                    else
                        transmittedTx = await this.getTransactionByInputs(
                            pendingTx.object,
                            setupsTemplates.filter((tx) => tx.setupId === pendingTx.setupId),
                            blockHash
                        );

                    if (transmittedTx) await writeIncomingTransaction(transmittedTx, blockHeight, pendingTx.templateId);
                } catch (error) {
                    console.error(error);
                    continue;
                }
            }

            blockHeight++;

            await updatedListenerHeightBySetupsIds(Array.from(new Set(pending.map((tx) => tx.setupId))), blockHeight);
        }
    }

    private async getTransactionByInputs(
        pendingTx: Transaction,
        setupTemplates: Pending[],
        blockHash: string
    ): Promise<RawTransaction | undefined> {
        try {
            const searchBy: [string, number][] = [];
            for (const input of pendingTx.inputs) {
                const parentTemplate = setupTemplates.find(
                    (template) => input.transactionName === template.transactionName && template.incomingTxId !== null
                );

                if (parentTemplate === undefined) return undefined;

                const utxo = await this.client.getTxOut(parentTemplate.incomingTxId!, input.outputIndex, false);
                if (utxo !== null) return undefined;
                searchBy.push([parentTemplate.incomingTxId!, input.outputIndex]);
            }

            const blockTxs = (await this.client.getBlock(blockHash)).tx;

            for (const blockTx of blockTxs) {
                const candidate = await this.client.getRawTransaction(blockTx, true, blockHash);
                if (candidate.vin.length !== searchBy.length) continue;

                if (
                    searchBy.every(
                        (search, index) =>
                            candidate.vin[index].txid === search[0] && candidate.vin[index].vout === search[1]
                    )
                )
                    return candidate;
            }
            return undefined;
        } catch (error) {
            console.error(error);
            return undefined;
        }
    }
}

if (process.argv[1] == __filename) {
    (async () => {
        const setupsTemplates = await readExpectedIncoming('bitsnark_prover_1');
        console.log(setupsTemplates.map((tx) => tx.listenerBlockHeight));
    })().catch(console.error);
}
