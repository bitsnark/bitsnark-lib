import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../bitcoin-node';
import { AgentRoles, TransactionNames, twoDigits } from '../common';
import {
    Incoming,
    OutgoingStatus,
    readActiveSetups,
    readIncomingTransactions,
    readOutgingByTemplateId,
    readTemplates,
    SetupStatus,
    writeOutgoing,
    writeSetupStatus
} from '../db';
import { createUniqueDataId, getTransactionByName, SpendingCondition, Transaction } from '../transactions-new';
import { parseTransactionData } from './parser';
import { step1_vm } from '../../generator/step1/vm/vm';
import { vKey } from '../../generator/step1/constants';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { findErrorState } from './states';
import { encodeWinternitz24 } from '../winternitz';
import { refuteArgument } from './refute';

export class ProtocolVerifier {
    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates: Transaction[] = [];
    states: any;

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
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
        const pairs = incoming
            .map((it) => {
                const template = this.templates.find((t) => t.templateId === it.templateId);
                if (!template) throw new Error('Missing template for incoming transaction: ' + it.templateId);
                return { incoming: it, template };
            })
            // order logically
            .sort((p1, p2) => p1.template.ordinal! - p2.template.ordinal!);

        const selectionPath: number[] = [];
        let proof: bigint[] = [];
        const states: Buffer[][] = [];

        // examine each one
        for (const pair of pairs) {
            const lastFlag = pair === pairs[pairs.length - 1];

            switch (pair.template.transactionName) {
                case TransactionNames.PROOF:
                    proof = this.parseProof(pair.incoming, pair.template);
                    if (lastFlag && !this.checkProof(proof)) {
                        this.sendChallenge();
                    }
                    break;
                case TransactionNames.PROOF_UNCONTESTED:
                    // we lost, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
                case TransactionNames.CHALLENGE:
                    if (lastFlag) {
                        const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                        if (timeoutSc) await this.sendChallengeUncontested();
                    }
                    break;
                case TransactionNames.CHALLENGE_UNCONTESTED:
                    // we won, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                    break;
                case TransactionNames.ARGUMENT:
                    if (lastFlag) {
                        this.refuteArgument(proof, states, selectionPath, pair.incoming, pair.template);
                    }
                    break;
                case TransactionNames.ARGUMENT_UNCONTESTED:
                    // we lost, mark it
                    await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                    break;
            }

            if (pair.template.transactionName.startsWith(TransactionNames.STATE)) {
                const state = this.parseState(pair.incoming, pair.template);
                this.states.push(state);
                await this.sendSelect(proof, states, selectionPath);
            }
            if (pair.template.transactionName.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we lost, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                break;
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT)) {
                const selection = this.parseSelection(pair.incoming, pair.template);
                selectionPath.push(selection);

                if (lastFlag) {
                    const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                    if (timeoutSc) await this.sendSelectUncontested(selectionPath.length);
                }
            }
            if (pair.template.transactionName.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
                // we won, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_FAILED);
                break;
            }
        }
    }

    private checkProof(proof: bigint[]): boolean {
        step1_vm.reset();
        groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
        return step1_vm.success?.value === 1n;
    }

    private async refuteArgument(
        proof: bigint[],
        states: Buffer<ArrayBufferLike>[][],
        selectionPath: number[],
        incoming: Incoming,
        template: Transaction
    ) {
        await refuteArgument();
    }

    private parseState(incoming: Incoming, template: Transaction) {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const state = parseTransactionData(
            this.templates,
            template,
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return state;
    }

    private async sendSelect(proof: bigint[], states: Buffer<ArrayBufferLike>[][], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const txName = TransactionNames.SELECT + '_' + twoDigits(iteration);
        const selection = await findErrorState(proof, states[states.length - 1], selectionPath);
        const selectionWi = encodeWinternitz24(BigInt(selection), createUniqueDataId(this.setupId, txName, 0, 0, 0));
        this.sendTransaction(txName, [selectionWi]);
    }

    private async sendTransaction(name: string, data?: Buffer[][]) {
        const template = getTransactionByName(this.templates, name);
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned) throw new Error('Outgoing transaction not found: ' + template.templateId);
        await writeOutgoing(presigned.template_id, data, OutgoingStatus.READY);
    }

    private parseProof(incoming: Incoming, template: Transaction): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseTransactionData(
            this.templates,
            template,
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private parseSelection(incoming: Incoming, template: Transaction): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseTransactionData(
            this.templates,
            template,
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
    }

    private async updateSetupStatus(status: SetupStatus) {
        await writeSetupStatus(this.setupId, status);
    }

    private async sendChallenge() {
        await this.sendTransaction(TransactionNames.CHALLENGE);
    }

    private async sendChallengeUncontested() {
        await this.sendTransaction(TransactionNames.CHALLENGE_UNCONTESTED);
    }

    private async sendSelectUncontested(iteration: number) {
        await this.sendTransaction(TransactionNames.SELECT_UNCONTESTED + '_' + twoDigits(iteration));
    }

    private async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    private async checkTimeout(incoming: Incoming, template: Transaction): Promise<SpendingCondition | null> {
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

export async function main(agentId: string) {
    const setups = await readActiveSetups();
    const doit = async () => {
        for (const setup of setups) {
            const protocol = new ProtocolVerifier(agentId, setup.setup_id);
            try {
                await protocol.process();
            } catch (e) {
                console.error(e);
            }
        }
    };

    do {
        doit();
        await new Promise((r) => setTimeout(r, agentConf.protocolIntervalMs));
        /*eslint no-constant-condition: "off"*/
    } while (true);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const agentId = process.argv[2] ?? 'bitsnark_verifier_1';
    main(agentId).catch(console.error);
}
