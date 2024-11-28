import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { AgentDb, ReceivedTransaction } from '../common/db';
import { createUniqueDataId, SpendingCondition, Transaction, twoDigits } from '../common/transactions';
import { encodeWinternitz256_4 } from '../common/winternitz';
import { calculateStates } from './states';
import { Argument } from './argument';
import { parseInput } from './parser';
import { bufferToBigintBE } from '../common/encoding';
import { last } from '../common/array-utils';
import { TransactionNames, iterations, AgentRoles } from '../common/types';

export class ProtocolProver {
    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates: Transaction[] = [];
    db: AgentDb;

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
        this.db = new AgentDb(this.agentId);
    }

    public async pegOut(proof: bigint[]) {
        await this.sendProof(proof);
    }

    public async process() {
        if (!this.templates) {
            this.templates = await this.db.getTransactions(this.setupId);
        }

        // read all incoming transactions
        const setup = await this.db.getSetup(this.setupId);
        const incomings = setup.received ?? [];
        if (incomings.length == 0) {
            // nothing to do
            return;
        }

        const selectionPathUnparsed: Buffer[][] = [];
        const selectionPath: number[] = [];
        let proof: bigint[] = [];

        // examine each one
        for (const incoming of incomings) {
            const lastFlag = incoming == last(incomings);

            switch (incoming.name) {
                case TransactionNames.PROOF:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(incoming);
                        if (timeoutSc) await this.sendProofUncontested();
                    } else {
                        // let's get the proof so we can run the verifier on it
                        proof = this.parseProof(incoming);
                    }
                    break;
                case TransactionNames.PROOF_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPeggoutSuccessful(this.setupId);
                    break;
                case TransactionNames.CHALLENGE:
                    if (lastFlag) {
                        // send the first state iteration
                    }
                    break;
                case TransactionNames.CHALLENGE_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPeggoutFailed(this.setupId);
                    break;
                case TransactionNames.ARGUMENT:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(incoming);
                        if (timeoutSc) await this.sendArgumentUncontested();
                    }
                    break;
                case TransactionNames.ARGUMENT_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPeggoutSuccessful(this.setupId);
                    break;
            }

            if (incoming.name.startsWith(TransactionNames.STATE)) {
                if (lastFlag) {
                    // did the timeout expire?
                    const timeoutSc = await this.checkTimeout(incoming);
                    if (timeoutSc) await this.sendStateUncontested(selectionPath.length);
                }
            }
            if (incoming.name.startsWith(TransactionNames.STATE_UNCONTESTED)) {
                // we won, mark it
                await this.db.markSetupPeggoutSuccessful(this.setupId);
                break;
            }
            if (incoming.name.startsWith(TransactionNames.SELECT)) {
                const rawTx = incoming.rawTransaction as RawTransaction;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                const selection = this.parseSelection(incoming);
                selectionPath.push(selection);
                if (lastFlag) {
                    if (selectionPath.length + 1 < iterations) await this.sendState(proof, selectionPath);
                    else await this.sendArgument(proof, selectionPath, selectionPathUnparsed);
                }
            }
            if (incoming.name.startsWith(TransactionNames.SELECT_UNCONTESTED)) {
                // we lost, mark it
                await this.db.markSetupPeggoutFailed(this.setupId);
                break;
            }
        }
    }

    private async sendTransaction(name: string, data?: Buffer[][]) {
        this.db.markToSend(this.setupId, name, data);
    }

    private async sendProof(proof: bigint[]) {
        const data = proof
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.setupId, TransactionNames.PROOF, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(TransactionNames.PROOF, [data]);
    }

    private async sendProofUncontested() {
        await this.sendTransaction(TransactionNames.PROOF_UNCONTESTED);
    }

    private parseProof(incoming: ReceivedTransaction): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseInput(
            this.templates,
            incoming.object.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private async sendArgument(proof: bigint[], selectionPath: number[], selectionPathUnparsed: Buffer[][]) {
        const argument = new Argument(this.setupId, proof);
        const argumentData = await argument.makeArgument(selectionPath, selectionPathUnparsed);
        await this.sendTransaction(TransactionNames.ARGUMENT, argumentData);
    }

    private async sendArgumentUncontested() {
        await this.sendTransaction(TransactionNames.ARGUMENT_UNCONTESTED);
    }

    private async sendStateUncontested(iteration: number) {
        await this.sendTransaction(TransactionNames.STATE_UNCONTESTED + '_' + twoDigits(iteration));
    }

    private parseSelection(incoming: ReceivedTransaction): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseInput(
            this.templates,
            incoming.object.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
    }

    private async sendState(proof: bigint[], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const states = await calculateStates(proof, selectionPath);
        const txName = TransactionNames.STATE + '_' + twoDigits(iteration);
        const statesWi = states
            .map((s, dataIndex) =>
                encodeWinternitz256_4(bufferToBigintBE(s), createUniqueDataId(this.setupId, txName, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(txName, [statesWi]);
    }

    private async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    private async checkTimeout(incoming: ReceivedTransaction): Promise<SpendingCondition | null> {
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
    const setups = await db.getPeggedSetups();
    const doit = async () => {
        for (const setup of setups) {
            const protocol = new ProtocolProver(agentId, setup.id);
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
    db.disconnect();
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    main(agentId).catch(console.error);
}
