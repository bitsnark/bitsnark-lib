import { BitcoinNode, TxRawData } from "../bitcoin-node";
import { AgentRoles, iterations, TransactionNames, twoDigits } from "../common";
import { Incoming, OutgoingStatus, readIncomingTransactions, readOutgingByTemplateId, readTemplates, SetupStatus, writeOutgoing, writeSetupStatus } from "../db";
import { createUniqueDataId, getTransactionByName, SpendingCondition, Transaction } from "../transactions-new";
import { encodeWinternitz256 } from "../winternitz";
import { parseTransactionData } from "./parser";
import { calculateStates } from "./states";

export class ProtocolProver {

    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates: Transaction[] = [];

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
    }

    public async pegOut(proof: bigint[]) {
        await this.sendProof(proof);
    }

    public async process() {

        if (!this.templates) {
            this.templates = await readTemplates(this.agentId, this.setupId);
        }

        // read all incoming transactions
        const incoming = await readIncomingTransactions(this.setupId);
        if (incoming.length == 0) {
            // nothing to do
            return;
        }

        // pair them
        let pairs = incoming.map(it => {
            const template = this.templates.find(t => t.templateId === it.templateId);
            if (!template)
                throw new Error('Missing template for incoming transaction: ' + it.templateId);
            return { incoming: it, template };
        });

        // order logically
        pairs = pairs.sort((p1, p2) => p1.template.ordinal! - p2.template.ordinal!);

        let selectionPath: number[] = [];
        let proof: bigint[] = [];

        // examine each one
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const lastFlag = i + 1 >= pairs.length;

            switch (pair.template.transactionName) {
                case TransactionNames.PROOF:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                        if (timeoutSc)
                            await this.sendProofUncontested();
                    } else {
                        // let's get the proof so we can run the verifier on it
                        proof = this.parseProof(pair.incoming, pair.template);
                    }
                    break;
                case TransactionNames.PROOF_UNCONTESTED:
                    // we won, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
                case TransactionNames.CHALLENGE:
                    if (lastFlag) {
                        // send the first state iteration
                    }
                    break;
                case TransactionNames.CHALLENGE_UNCONTESTED:
                    // we lost, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                    break;
                case TransactionNames.ARGUMENT:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                        if (timeoutSc)
                            await this.sendArgumentUncontested();
                    }
                    break;
                case TransactionNames.ARGUMENT_UNCONTESTED:
                    // we won, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
            }

            if (pair.template.transactionName.startsWith(TransactionNames.STATE)) {
                if (lastFlag) {
                    // did the timeout expire?
                    const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                    if (timeoutSc)
                        await this.sendStateUncontested(selectionPath.length);
                }
            }
            if (pair.template.transactionName.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we won, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                break;
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT)) {
                const selection = this.parseSelection(pair.incoming, pair.template);
                selectionPath.push(selection);
                if (lastFlag) {
                    if (selectionPath.length < iterations)
                        this.sendState(proof, selectionPath);
                    else
                        this.sendArgument();
                }
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
                // we lost, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                break;
            }
        }
    }

    async sendProof(proof: bigint[]) {
        const template = getTransactionByName(this.templates, TransactionNames.PROOF);
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned)
            throw new Error('Outgoing transaction not found: ' + template.templateId);
        const data = proof.map((n, dataIndex) => encodeWinternitz256(n, createUniqueDataId(this.setupId, TransactionNames.PROOF, 0, 0, dataIndex))).flat();
        await writeOutgoing(
            presigned.template_id,
            [ data ],
            OutgoingStatus.READY);
    }

    async sendTransactionNoData(name: string) {
        const template = getTransactionByName(this.templates, name);
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned)
            throw new Error('Outgoing transaction not found: ' + template.templateId);
        await writeOutgoing(presigned.template_id, [], OutgoingStatus.READY);
    }

    async sendProofUncontested() {
        await this.sendTransactionNoData(TransactionNames.PROOF_UNCONTESTED);
    }

    parseProof(incoming: Incoming, template: Transaction): bigint[] {
        const rawTx = incoming.rawTransaction as TxRawData;
        const proof = parseTransactionData(this.templates, template, rawTx.vin[0].txinwitness!.map(s => Buffer.from(s, 'hex')));
        return proof;
    }

    async updateSetupStatus(status: SetupStatus) {
        await writeSetupStatus(this.setupId, status);
    }

    async sendArgument(proof: bigint[], selectionPath: number[]) {


    }

    async sendArgumentUncontested() {
        await this.sendTransactionNoData(TransactionNames.ARGUMENT_UNCONTESTED);
    }

    async sendStateUncontested(iteration: number) {
        await this.sendTransactionNoData(TransactionNames.STATE_UNCONTESTED + '_' + twoDigits(iteration));
    }

    parseSelection(incoming: Incoming, template: Transaction): number {
        const rawTx = incoming.rawTransaction as TxRawData;
        const data = parseTransactionData(this.templates, template, rawTx.vin[0].txinwitness!.map(s => Buffer.from(s, 'hex')));
        return Number(data[0]);
    }

    async sendState(proof: bigint[], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const template = getTransactionByName(this.templates, TransactionNames.STATE + '_' + twoDigits(iteration));
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned)
            throw new Error('Outgoing transaction not found: ' + template.templateId);
        const states = calculateStates(proof, selectionPath);
        await writeOutgoing(presigned.template_id, [ states ], OutgoingStatus.READY);
    }

    async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    async checkTimeout(incoming: Incoming, template: Transaction): Promise<SpendingCondition | null> {
        // check if any spending condition has a timeout that already expired
        const currentBlockHeight = await this.getCurrentBlockHeight();
        for (const output of template.outputs) {
            for (const sc of output.spendingConditions) {
                if (sc.nextRole != AgentRoles.PROVER) continue;
                if (sc.timeoutBlocks && incoming.blockHeight + sc.timeoutBlocks <= currentBlockHeight) {
                    // found one, send the relevant tx
                    return sc;
                }
            }
        }
        return null;
    }
}
