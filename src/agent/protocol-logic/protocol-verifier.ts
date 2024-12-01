import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import {
    Incoming,
    OutgoingStatus,
    readActiveSetups,
    readIncomingTransactions,
    readOutgingByTemplateId,
    readSetup,
    readTemplates,
    Setup,
    SetupStatus,
    writeOutgoing,
    writeSetupStatus,
    writeTemplate
} from '../common/db';
import { getTransactionByName, SpendingCondition, Transaction, twoDigits } from '../common/transactions';
import { parseInput } from './parser';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import { vKey } from '../../generator/ec_vm/constants';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { findErrorState } from './states';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { Argument } from './argument';
import { last } from '../common/array-utils';
import { TransactionNames, AgentRoles } from '../common/types';
import { bigintToBufferBE } from '../common/encoding';
import { createUniqueDataId } from '../setup/wots-keys';

export class ProtocolVerifier {
    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates?: Transaction[];
    states: Buffer[][] = [];
    setup?: Setup;

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
    }

    public async process() {
        if (!this.templates) {
            this.templates = await readTemplates(this.agentId, this.setupId);
        }
        if (!this.setup) {
            this.setup = await readSetup(this.setupId);
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
                const template = this.templates!.find((t) => t.templateId === it.templateId);
                if (!template) throw new Error('Missing template for incoming transaction: ' + it.templateId);
                return { incoming: it, template };
            })
            // order logically
            .sort((p1, p2) => p1.template.ordinal! - p2.template.ordinal!);

        const selectionPath: number[] = [];
        const selectionPathUnparsed: Buffer[][] = [];
        let proof: bigint[] = [];
        const states: Buffer[][] = [];

        // examine each one
        for (const pair of pairs) {
            const lastFlag = pair === last(pairs);

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
                        this.refuteArgument(proof, pair.incoming, pair.template);
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
            } else if (pair.template.transactionName.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we lost, mark it
                await this.updateSetupStatus(SetupStatus.PEGOUT_SUCCESSFUL);
                break;
            } else if (pair.template.transactionName.startsWith(TransactionNames.SELECT)) {
                const selection = this.parseSelection(pair.incoming, pair.template);
                selectionPath.push(selection);
                const rawTx = pair.incoming.rawTransaction as RawTransaction;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                if (lastFlag) {
                    const timeoutSc = await this.checkTimeout(pair.incoming, pair.template);
                    if (timeoutSc) await this.sendSelectUncontested(selectionPath.length);
                }
            } else if (pair.template.transactionName.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
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

    private async refuteArgument(proof: bigint[], incoming: Incoming, template: Transaction) {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const argData = rawTx.vin.map((vin, i) =>
            parseInput(
                this.templates!,
                template.inputs[i],
                vin.txinwitness!.map((s) => Buffer.from(s, 'hex'))
            )
        );
        const argument = new Argument(this.setupId, this.setup!.wotsSalt, proof);
        const refutation = await argument.refute(this.templates!, argData, this.states);

        template.inputs[0].script = refutation.script;
        template.inputs[0].controlBlock = refutation.controlBlock;
        await writeTemplate(this.agentId, this.setupId, template);
        const data = refutation.data
            .map((n, dataIndex) =>
                encodeWinternitz256_4(
                    n,
                    createUniqueDataId(this.setup!.wotsSalt, TransactionNames.PROOF_REFUTED, 0, 0, dataIndex)
                )
            )
            .flat();
        this.sendTransaction(TransactionNames.PROOF_REFUTED, [data]);
    }

    private parseState(incoming: Incoming, template: Transaction): Buffer[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const state = parseInput(
            this.templates!,
            template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return state.map((n) => bigintToBufferBE(n, 256));
    }

    private async sendSelect(proof: bigint[], states: Buffer[][], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const txName = TransactionNames.SELECT + '_' + twoDigits(iteration);
        const selection = await findErrorState(proof, last(states), selectionPath);
        const selectionWi = encodeWinternitz24(
            BigInt(selection),
            createUniqueDataId(this.setup!.wotsSalt, txName, 0, 0, 0)
        );
        this.sendTransaction(txName, [selectionWi]);
    }

    private async sendTransaction(name: string, data?: Buffer[][]) {
        const template = getTransactionByName(this.templates!, name);
        // find the pre-signed message
        const presigned = await readOutgingByTemplateId(template.templateId!);
        if (!presigned) throw new Error('Outgoing transaction not found: ' + template.templateId);
        await writeOutgoing(presigned.template_id, data, OutgoingStatus.READY);
    }

    private parseProof(incoming: Incoming, template: Transaction): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseInput(
            this.templates!,
            template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private parseSelection(incoming: Incoming, template: Transaction): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseInput(
            this.templates!,
            template.inputs[0],
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
