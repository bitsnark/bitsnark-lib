import { agentConf } from '../agent.conf';
import { BitcoinNetwork, BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
import { ListenerDb } from './listener-db';
import { Input, Template, TemplateNames } from '../common/types';

export interface expectByInputs {
    setupId: string;
    name: string;
    templateId: number;
    vins: { outputtxid: string; outputIndex: number; vin: number }[];
}

export class BitcoinListener {
    private tipHeight: number = 0;
    private tipHash: string = '';
    public client;
    public db: ListenerDb;

    constructor(agentId: string) {
        this.client = new BitcoinNode().client;
        this.db = new ListenerDb(agentId);
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

    async searchBlock(blockHeight: number, pending: Template[], templates: Template[]): Promise<void> {
        const blockHash = await this.client.getBlockHash(blockHeight);

        for (const pendingTx of pending) {
            try {
                let transmittedTx: RawTransaction | undefined;
                if (!pendingTx.unknownTxid)
                    transmittedTx = await this.client.getRawTransaction(pendingTx.txid!, true, blockHash);
                else
                    transmittedTx = await this.getTransactionByInputs(
                        pendingTx.inputs,
                        templates.filter((template) => template.setupId === pendingTx.setupId),
                        blockHash
                    );

                if (transmittedTx)
                    await this.db.markReceived(
                        pendingTx.setupId!,
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
    }
    private async getTransactionByInputs(
        inputs: Input[],
        templates: Template[],
        blockHash: string
    ): Promise<RawTransaction | undefined> {
        try {
            const searchBy: [string, number][] = [];
            for (const input of inputs) {
                const parentTemplate = templates.find(
                    (template) => input.templateName === template.name && template.txid
                );

                if (parentTemplate === undefined) return undefined;

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
    (async () => {

        const dbProver = new ListenerDb('bitsnark_prover_1');
        const dbVerifier = new ListenerDb('bitsnark_verifier_1');

        const testnetTxs = [{
            name: TemplateNames.LOCKED_FUNDS,
            block: 3519980,
            txId: '64f14028c168c99caf145933ce121b7989051a2042dc7f4bc30a6d1bc793ddf8'
        },
        {
            name: TemplateNames.PROVER_STAKE,
            block: 3519962,
            txId: '2844b5d8a0262628b3a31a5b270b89eca93a4b6ae9007481f21a045557515a42'
        },
        {
            name: TemplateNames.PROOF,
            txId: '34d82044efa0964c9800252d528c93012b4022059ff921485f533ac3fe2d3e13'
        }]


        for (const tx of testnetTxs) {
            await dbProver.query(`UPDATE templates
                SET txid = j $1
                WHERE name = $2;`, [tx.txId, tx.name]);
            await dbVerifier.query(`UPDATE templates
                SET txid = j $1
                WHERE name = $2;`, [tx.txId, tx.name]);
        }




    })().catch((error) => {
        throw error;
    });
}
