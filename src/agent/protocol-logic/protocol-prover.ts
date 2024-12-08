import minimist from 'minimist';
import { RawTransaction } from 'bitcoin-core';
import { agentConf } from '../agent.conf';
import { BitcoinNode } from '../common/bitcoin-node';
import { encodeWinternitz256_4 } from '../common/winternitz';
import { calculateStates } from './states';
import { Argument } from './argument';
import { parseInput } from './parser';
import { bufferToBigintBE } from '../common/encoding';
import { last } from '../common/array-utils';
import { createUniqueDataId } from '../setup/wots-keys';
import { AgentRoles, iterations, Setup, SpendingCondition, Template, TemplateNames } from '../common/types';
import { twoDigits } from '../common/templates';
import { ListenerDb, ReceivedTemplate } from '../listener/listener-db';
import { broadcastTransaction } from './broadcast-transaction';

export class ProtocolProver {
    agentId: string;
    setupId: string;
    bitcoinClient: BitcoinNode;
    templates?: Template[];
    setup?: Setup;
    db: ListenerDb;

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.bitcoinClient = new BitcoinNode();
        this.db = new ListenerDb(this.agentId);
    }

    private async setTemplates() {
        if (!this.templates || !this.templates.length) {
            this.templates = await this.db.getTemplates(this.setupId);
        }
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }
    }

    public async pegOut(proof: bigint[]) {
        await this.setTemplates();
        await this.sendProof(proof);
    }

    public async process() {
        await this.setTemplates();

        // read all incoming transactions
        const setup = await this.db.getReceivedSetups(this.setupId);
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
                case TemplateNames.PROOF:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(incoming);
                        if (timeoutSc) await this.sendProofUncontested();
                    } else {
                        // let's get the proof so we can run the verifier on it
                        proof = this.parseProof(incoming);
                    }
                    break;
                case TemplateNames.PROOF_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPegoutSuccessful(this.setupId);
                    break;
                case TemplateNames.CHALLENGE:
                    if (lastFlag) {
                        // send the first state iteration
                        //proof[0] = proof[0] - 1n; //<<---TEST
                        await this.sendState(proof, []);
                    }
                    break;
                case TemplateNames.CHALLENGE_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPegoutFailed(this.setupId);
                    break;
                case TemplateNames.ARGUMENT:
                    if (lastFlag) {
                        // did the timeout expire?
                        const timeoutSc = await this.checkTimeout(incoming);
                        if (timeoutSc) await this.sendArgumentUncontested();
                    }
                    break;
                case TemplateNames.ARGUMENT_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPegoutSuccessful(this.setupId);
                    break;
            }

            if (incoming.name.startsWith(TemplateNames.STATE)) {
                if (lastFlag) {
                    // did the timeout expire?
                    const timeoutSc = await this.checkTimeout(incoming);
                    if (timeoutSc) await this.sendStateUncontested(selectionPath.length);
                }
            }
            if (incoming.name.startsWith(TemplateNames.STATE_UNCONTESTED)) {
                // we won, mark it
                await this.db.markSetupPegoutSuccessful(this.setupId);
                break;
            }
            if (incoming.name.startsWith(TemplateNames.SELECT)) {
                const rawTx = incoming.rawTransaction as RawTransaction;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                const selection = this.parseSelection(incoming);
                selectionPath.push(selection);
                if (lastFlag) {
                    if (selectionPath.length + 1 < iterations) await this.sendState(proof, selectionPath);
                    else await this.sendArgument(proof, selectionPath, selectionPathUnparsed);
                }
            }
            if (incoming.name.startsWith(TemplateNames.SELECT_UNCONTESTED)) {
                // we lost, mark it
                await this.db.markSetupPegoutFailed(this.setupId);
                break;
            }
        }
    }

    private async sendTransaction(name: string, data?: Buffer[][]) {
        this.db.markTemplateToSend(this.setupId, name, data);
        console.warn(`Sending transaction ${name} manually for now`);
        await broadcastTransaction(this.agentId, this.setupId, name);
    }

    private async sendProof(proof: bigint[]) {
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }
        const data = proof
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.setup!.wotsSalt, TemplateNames.PROOF, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(TemplateNames.PROOF, [data]);
    }

    private async sendProofUncontested() {
        await this.sendTransaction(TemplateNames.PROOF_UNCONTESTED);
    }

    private parseProof(incoming: ReceivedTemplate): bigint[] {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const proof = parseInput(
            this.templates!,
            incoming.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    private async sendArgument(proof: bigint[], selectionPath: number[], selectionPathUnparsed: Buffer[][]) {
        const argument = new Argument(this.setup!.wotsSalt, proof);
        const argumentData = await argument.makeArgument(selectionPath, selectionPathUnparsed);
        await this.sendTransaction(TemplateNames.ARGUMENT, argumentData);
    }

    private async sendArgumentUncontested() {
        await this.sendTransaction(TemplateNames.ARGUMENT_UNCONTESTED);
    }

    private async sendStateUncontested(iteration: number) {
        await this.sendTransaction(TemplateNames.STATE_UNCONTESTED + '_' + twoDigits(iteration));
    }

    private parseSelection(incoming: ReceivedTemplate): number {
        const rawTx = incoming.rawTransaction as RawTransaction;
        const data = parseInput(
            this.templates!,
            incoming.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
    }

    private async sendState(proof: bigint[], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const states = await calculateStates(proof, selectionPath);
        const txName = TemplateNames.STATE + '_' + twoDigits(iteration);
        const statesWi = states
            .map((s, dataIndex) =>
                encodeWinternitz256_4(
                    bufferToBigintBE(s),
                    createUniqueDataId(this.setup!.wotsSalt, txName, 0, 0, dataIndex)
                )
            )
            .flat();
        await this.sendTransaction(txName, [statesWi]);
    }

    private async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    private async checkTimeout(incoming: ReceivedTemplate): Promise<SpendingCondition | null> {
        // check if any spending condition has a timeout that already expired
        const currentBlockHeight = await this.getCurrentBlockHeight();
        for (const output of incoming.outputs) {
            for (const sc of output.spendingConditions) {
                if (sc.nextRole != AgentRoles.PROVER) continue;
                if (sc.timeoutBlocks && incoming.blockHeight! + sc.timeoutBlocks <= currentBlockHeight) {
                    // found one, send the relevant tx
                    return sc;
                }
            }
        }
        return null;
    }
}

export async function main(agentId: string) {
    const db = new ListenerDb(agentId);
    const setups = await db.getActiveSetups();
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
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args._[0] ?? args['agent-id'] ?? 'bitsnark_prover_1';
    main(agentId).catch((error) => {
        throw error;
    });
}
