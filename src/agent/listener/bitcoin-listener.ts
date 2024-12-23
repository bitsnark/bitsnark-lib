import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { RawTransaction } from 'bitcoin-core';
import { Input } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { getTemplatesRows, JoinedTemplate } from './listener-utils';

export class BitcoinListener {
    tipHeight: number = 0;
    tipHash: string = '';
    client;
    db: AgentDb;
    joinedTemplates: JoinedTemplate[] = [];

    constructor(agentId: string) {
        this.client = new BitcoinNode().client;
        this.db = new AgentDb(agentId);
    }

    async startBlockchainCrawler(): Promise<void> {
        do {
            await this.checkForNewBlock();
            await new Promise((r) => setTimeout(r, agentConf.blockCheckIntervalMs));
            /*eslint no-constant-condition: "off"*/
        } while (true);
    }

    async checkForNewBlock() {
        const tipHash = await this.client.getBestBlockHash();
        if (tipHash !== this.tipHash) {
            this.tipHeight = await this.client.getBlockCount();
            console.log('New block detected:', tipHash, this.tipHeight);
            this.tipHash = tipHash;
            await this.monitorTransmitted();
        } else {
            console.log('No new block detected');
        }
    }

    async monitorTransmitted(): Promise<void> {
        this.joinedTemplates = await getTemplatesRows(this.db);
        let pending = this.joinedTemplates.filter((template) => !template.blockHash);
        if (pending.length === 0) return;

        let blockHeight = (pending[0].lastCheckedBlockHeight ?? 0) + 1;

        // No re-organization support - we wait until blocks are finalized
        while (blockHeight <= this.tipHeight - agentConf.blocksUntilFinalized) {
            console.log('Checking block:', blockHeight);
            const noTxFound = await this.searchBlock(blockHeight, pending);
            if (noTxFound) {
                blockHeight++;
                await this.db.updateSetupLastCheckedBlockHeightBatch(
                    [...pending.reduce((setupIds, template) => setupIds.add(template.setupId!), new Set<string>())],
                    blockHeight
                );
            } else {
                pending = this.joinedTemplates.filter((template) => !template.blockHash);
            }
        }
    }

    async searchBlock(blockHeight: number, pending: JoinedTemplate[]): Promise<boolean> {
        const blockHash = await this.client.getBlockHash(blockHeight);
        const block = await this.client.getBlock(blockHash, 2);
        const blockTxArr = block.tx as RawTransaction[];
        const blockTxids = new Set(blockTxArr.map((raw) => raw.txid));
        let noTxFound = true;

        for (const currentTemplate of pending.filter((template) => !template.unknownTxid)) {
            if (!blockTxids.has(currentTemplate.txid ?? '')) continue;
            const raw = blockTxArr.filter((raw) => raw.txid === currentTemplate.txid)[0];
            if (raw) await this.markReceived(currentTemplate, raw, blockTxids, blockHeight, blockHash);
            noTxFound = false;
        }

        //Find and save all pending templates with unknown txid that are in the block.
        const blockVinsTxids = new Set(blockTxArr.map((raw) => raw.vin.map((vin) => vin.txid)).flat());

        for (const currentTemplate of pending.filter((template) => template.unknownTxid)) {
            for (const input of currentTemplate.inputs) {
                const parent = getParentByInput(input, currentTemplate, this.joinedTemplates);
                if (!parent?.txid || !blockVinsTxids.has(parent.txid)) continue;
                const raw = getRawByVinTxid(parent.txid, blockTxArr);
                this.markReceived(currentTemplate, raw!, blockTxids, blockHeight, blockHash);
                noTxFound = false;
            }
        }

        function getParentByInput(
            input: Input,
            currentTemplate: JoinedTemplate,
            templates: JoinedTemplate[]
        ): JoinedTemplate | undefined {
            return (
                templates.filter((t) => t.setupId! === currentTemplate.setupId! && t.name == input.templateName)[0] ??
                ''
            );
        }

        function getRawByVinTxid(vinTxid: string, blockTxArr: RawTransaction[]): RawTransaction | undefined {
            return blockTxArr.filter((raw) => raw.vin.some((vin) => vin.txid === vinTxid))[0];
        }

        return noTxFound;
    }

    async markReceived(
        currentTemplate: JoinedTemplate,
        raw: RawTransaction,
        blockTxids: Set<string>,
        blockHeight: number,
        blockHash: string
    ): Promise<void> {
        const posInBlock = Array.from(blockTxids).indexOf(raw.txid);

        await this.db.markReceived(currentTemplate, blockHeight, blockHash, raw, posInBlock);

        this.joinedTemplates.find((template) => template.id === currentTemplate.id)!.blockHash = blockHash;
    }
}

if (require.main === module) {
    Promise.all(
        ['bitsnark_prover_1', 'bitsnark_verifier_1'].map((agentId) =>
            new BitcoinListener(agentId).startBlockchainCrawler()
        )
    ).catch((error) => {
        throw error;
    });
}
