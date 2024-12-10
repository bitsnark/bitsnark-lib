import { agentConf } from '../agent.conf';
import { BitcoinNetwork, BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
import { ListenerDb, ReceivedTemplate } from './listener-db';
import { Input, Template, TemplateNames } from '../common/types';

export interface expectByInputs {
    setupId: string;
    name: string;
    templateId: number;
    vins: { outputtxid: string; outputIndex: number; vin: number }[];
}

export class BitcoinListener {
    tipHeight: number = 0;
    tipHash: string = '';
    client;
    db: ListenerDb;

    constructor(agentId: string, mode: BitcoinNetwork = agentConf.bitcoinNodeNetwork as BitcoinNetwork) {
        this.client = new BitcoinNode(mode).client;
        this.db = new ListenerDb(agentId);
    }

    async checkForNewBlock() {
        const tipHash = await this.client.getBestBlockHash();
        if (tipHash !== this.tipHash) {
            this.tipHeight = await this.client.getBlockCount();
            console.log('New block detected:', tipHash, this.tipHeight);
            this.tipHash = tipHash;
            this.monitorTransmitted();
        }
    }

    async monitorTransmitted(): Promise<void> {
        const templates = await this.db.getReceivedTemplates();
        const pending = templates.filter((template) => !template.blockHash);
        if (pending.length === 0) return;

        let blockHeight = (pending[0].lastCheckedBlockHeight ?? 0) + 1;

        // No re-organization support - we just wait for blocks to be finalized.
        while (blockHeight <= this.tipHeight - agentConf.blocksUntilFinalized) {
            await this.searchBlock(blockHeight, pending, templates);

            blockHeight++;

            await this.db.updateSetupLastCheckedBlockHeightBatch(
                [...pending.reduce((setupIds, template) => setupIds.add(template.setupId), new Set<string>())],
                blockHeight
            );
        }
    }

    async searchBlock(blockHeight: number, pending: Template[], templates: ReceivedTemplate[]): Promise<void> {
        const blockHash = await this.client.getBlockHash(blockHeight);

        for (const pendingTx of pending) {
            try {
                let transmittedTx: RawTransaction | undefined;
                if (!pendingTx.unknownTxid)
                    try {
                        transmittedTx = await this.client.getRawTransaction(pendingTx.txid!, true, blockHash);
                    } catch (error) {
                        continue;
                    }
                else
                    transmittedTx = await this.getTransactionByInputs(
                        pendingTx.inputs,
                        templates.filter((template) => template.setupId === pendingTx.setupId),
                        blockHash
                    );

                if (transmittedTx) {
                    await this.db.markReceived(
                        pendingTx.setupId!,
                        pendingTx.name,
                        transmittedTx.txid,
                        transmittedTx.blockhash,
                        blockHeight,
                        transmittedTx
                    );
                    templates.find((template) => template.name === pendingTx.name)!.blockHash = transmittedTx.blockhash;
                }
            } catch (error) {
                console.error(error);
                continue;
            }
        }
    }

    private async getTransactionByInputs(
        inputs: Input[],
        templates: ReceivedTemplate[],
        blockHash: string
    ): Promise<RawTransaction | undefined> {
        try {
            const searchBy: [string, number][] = [];
            for (const input of inputs) {
                const parentTemplate = templates.find(
                    (template) => input.templateName === template.name && template.txid
                );

                if (parentTemplate === undefined || !parentTemplate.blockHash) return undefined;

                const utxo = await this.client.getTxOut(parentTemplate.txid!, input.outputIndex, false);
                if (utxo !== null) return undefined;
                searchBy.push([parentTemplate.txid!, input.outputIndex]);
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
            console.log(error);
            return undefined;
        }
    }
}

if (require.main === module) {
    Promise.all(
        ['bitsnark_prover_1', 'bitsnark_verifier_1'].map((agentId) => new BitcoinListener(agentId).checkForNewBlock())
    ).catch((error) => {
        throw error;
    });
}
