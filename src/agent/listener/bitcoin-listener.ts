import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { BlockVerbosity, RawTransaction } from 'bitcoin-core';
import { Input } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { getTemplatesRows, JoinedTemplate } from './listener-utils';
import { sleep } from '../common/sleep';

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
        while (true) {
            try {
                await this.checkForNewBlock();
            } catch (error) {
                console.error('Error in blockchain listener:', error);
            }
            await sleep(agentConf.blockCheckIntervalMs);
        }
    }

    async checkForNewBlock() {
        const tipHash = await this.client.getBestBlockHash();
        if (tipHash !== this.tipHash) {
            this.tipHeight = await this.client.getBlockCount();
            console.log('New block detected:', tipHash, this.tipHeight);
            this.tipHash = tipHash;
            await this.monitorTransmitted();
        }
    }

    async monitorTransmitted(): Promise<void> {
        this.joinedTemplates = await getTemplatesRows(this.db);
        let pending = this.joinedTemplates.filter((template) => !template.blockHash);
        if (pending.length === 0) return;

        // No re-organization support - we wait until blocks are finalized
        for (
            let blockHeight = (pending[0].lastCheckedBlockHeight ?? 0) + 1;
            blockHeight <= this.tipHeight - agentConf.blocksUntilFinalized;
            blockHeight++
        ) {
            const noTxFound = await this.searchBlock(blockHeight, pending);
            console.log(`Found ${noTxFound ? 'no ' : ''}new transactions in block ${blockHeight}`);
            if (noTxFound) {
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
        const block = await this.client.getBlock(blockHash, BlockVerbosity.jsonWithTxs);
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
                await this.markReceived(currentTemplate, raw!, blockTxids, blockHeight, blockHash);
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
    const args = minimist(process.argv.slice(2));
    const agentId = args._[0] ?? 'bitsnark_prover_1';
    new BitcoinListener(agentId).startBlockchainCrawler().catch((error) => {
        throw error;
    });
}
