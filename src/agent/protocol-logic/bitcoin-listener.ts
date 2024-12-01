import { Transaction } from '../common/transactions';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
import { AgentDb, ExpectedTemplate } from '../common/db';

export interface expectByInputs {
    setupId: string;
    name: string;
    templateId: number;
    vins: { outputTxid: string; outputIndex: number; vin: number }[];
}

export class BitcoinListener {
    private agentId: string;
    private tipHeight: number = 0;
    private tipHash: string = '';
    public client;
    public db: AgentDb;

    constructor(agentId: string) {
        this.client = new BitcoinNode().client;
        this.agentId = agentId;
        this.db = new AgentDb(this.agentId);
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
        const templates = await this.db.getExpectedTemplates();
        const pending = templates.filter((template) => template.blockHash === null);
        if (pending.length === 0) return;

        let blockHeight = (pending[0].lastCheckedBlockHeight ?? 0) + 1;

        // No re-organization support - we just wait for blocks to be finalized.
        while (blockHeight <= this.tipHeight - agentConf.blocksUntilFinalized) {
            const blockHash = await this.client.getBlockHash(blockHeight);

            for (const pendingTx of pending) {
                try {
                    let transmittedTx: RawTransaction | undefined;
                    if (!pendingTx.object.temporaryTxId)
                        transmittedTx = await this.client.getRawTransaction(pendingTx.object.txId!, true, blockHash);
                    else
                        transmittedTx = await this.getTransactionByInputs(
                            pendingTx.object,
                            templates.filter((template) => template.setupId === pendingTx.setupId),
                            blockHash
                        );

                    if (transmittedTx)
                        await this.db.markReceived(
                            pendingTx.setupId,
                            pendingTx.name,
                            transmittedTx.txid,
                            transmittedTx.blockhash,
                            blockHeight,
                            transmittedTx
                        );
                } catch (error) {
                    console.error(error);
                    continue;
                }
            }

            blockHeight++;

            await this.db.updateLastCheckedBlockHeightBatch(
                [...pending.reduce((setupIds, template) => setupIds.add(template.setupId), new Set<string>())],
                blockHeight
            );
        }
    }

    private async getTransactionByInputs(
        pendingTx: Transaction,
        setupTemplates: ExpectedTemplate[],
        blockHash: string
    ): Promise<RawTransaction | undefined> {
        try {
            const searchBy: [string, number][] = [];
            for (const input of pendingTx.inputs) {
                const parentTemplate = setupTemplates.find(
                    (template) => input.transactionName === template.name && template.txId
                );

                if (parentTemplate === undefined) return undefined;

                const utxo = await this.client.getTxOut(parentTemplate.txId!, input.outputIndex, false);
                if (utxo !== null) return undefined;
                searchBy.push([parentTemplate.txId!, input.outputIndex]);
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

if (require.main === module) {
    (async () => {
        const db = new AgentDb('bitsnark_prover_1');
        const pending = await db.getExpectedTemplates();
        console.log(pending.map((tx) => tx.lastCheckedBlockHeight));
    })().catch((error) => {
        throw error;
    });
}
