import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { AgentDb, ReceivedTemplate, Setup } from '../common/db';
import { SpendingCondition, Transaction, twoDigits } from '../common/transactions';
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
    db: AgentDb;

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
        this.db = new AgentDb(this.agentId);
    }

    public async process() {
        if (!this.templates) {
            this.templates = await this.db.getTransactions(this.setupId);
        }
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }

        // read all incoming transactions
        const setup = await this.db.getSetup(this.setupId);
        const incomings = setup.received ?? [];
        if (incomings.length == 0) {
            // nothing to do
            return;
        }

        const selectionPath: number[] = [];
        const selectionPathUnparsed: Buffer[][] = [];
        let proof: bigint[] = [];
        const states: Buffer[][] = [];

        // examine each one
        for (const incoming of incomings) {
            const lastFlag = incoming == last(incomings);

            switch (incoming.name) {
                case TransactionNames.PROOF:
                    proof = this.parseProof(incoming);
                    if (lastFlag && !this.checkProof(proof)) {
                        this.sendChallenge();
                    }
                    break;
                case TransactionNames.PROOF_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPeggoutSuccessful(this.setupId);
                    break;
                case TransactionNames.CHALLENGE:
                    if (lastFlag) {
                        const timeoutSc = await this.checkTimeout(incoming);
                        if (timeoutSc) await this.sendChallengeUncontested();
                    }
                    break;
                case TransactionNames.CHALLENGE_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPeggoutFailed(this.setupId);
                    break;
                case TransactionNames.ARGUMENT:
                    if (lastFlag) {
                        this.refuteArgument(proof, incoming);
                    }
                    break;
                case TransactionNames.ARGUMENT_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPeggoutSuccessful(this.setupId);
                    break;
            }

            if (incoming.name.startsWith(TransactionNames.STATE)) {
                const state = this.parseState(incoming);
                this.states.push(state);
                await this.sendSelect(proof, states, selectionPath);
            } else if (incoming.name.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we lost, mark it
                await this.db.markSetupPeggoutSuccessful(this.setupId);
                break;
            } else if (incoming.name.startsWith(TransactionNames.SELECT)) {
                const selection = this.parseSelection(incoming);
                selectionPath.push(selection);
                const rawTx = incoming.rawTransaction as RawTransaction;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                if (lastFlag) {
                    const timeoutSc = await this.checkTimeout(incoming);
                    if (timeoutSc) await this.sendSelectUncontested(selectionPath.length);
                }
            } else if (incoming.name.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
                // we won, mark it
                await this.db.markSetupPeggoutFailed(this.setupId);
                break;
            }
        }
    }

    private checkProof(proof: bigint[]): boolean {
        step1_vm.reset();
        groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
        return step1_vm.success?.value === 1n;
    }

    private async refuteArgument(proof: bigint[], incoming: ReceivedTemplate) {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const argData = rawTx.vin.map((vin, i) =>
            parseInput(
                this.templates!,
                incoming.object.inputs[i],
                vin.txinwitness!.map((s) => Buffer.from(s, 'hex'))
            )
        );
        const argument = new Argument(this.setupId, this.setup!.wotsSalt, proof);
        const refutation = await argument.refute(this.templates!, argData, this.states);

        incoming.object.inputs[0].script = refutation.script;
        incoming.object.inputs[0].controlBlock = refutation.controlBlock;
        await this.db.upsertTemplates(this.setupId, [incoming.object]);
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

    private parseState(incoming: ReceivedTemplate): Buffer[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const state = parseInput(
            this.templates!,
            incoming.object.inputs[0],
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
        this.db.markToSend(this.setupId, name, data);
    }

    private parseProof(incoming: ReceivedTemplate): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseInput(
            this.templates!,
            incoming.object.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private parseSelection(incoming: ReceivedTemplate): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseInput(
            this.templates!,
            incoming.object.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
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

    private async checkTimeout(incoming: ReceivedTemplate): Promise<SpendingCondition | null> {
        // check if any spending condition has a timeout that already expired
        const currentBlockHeight = await this.getCurrentBlockHeight();
        for (const output of incoming.object.outputs) {
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
    const db = new AgentDb(agentId);
    const setups = await db.getActiveSetups();
    const doit = async () => {
        for (const setup of setups) {
            const protocol = new ProtocolVerifier(agentId, setup.id);
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
