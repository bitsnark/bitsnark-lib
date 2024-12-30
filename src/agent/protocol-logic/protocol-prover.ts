import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { encodeWinternitz256_4 } from '../common/winternitz';
import { calculateStates } from './states';
import { Argument } from './argument';
import { bufferToBigintBE } from '../common/encoding';
import { last } from '../common/array-utils';
import { createUniqueDataId } from '../setup/wots-keys';
import { AgentRoles, iterations, TemplateNames } from '../common/types';
import { twoDigits } from '../common/templates';
import { AgentDb } from '../common/agent-db';
import { ProtocolBase } from './protocol-base';
import { sleep } from '../common/sleep';

export class ProtocolProver extends ProtocolBase {
    constructor(agentId: string, setupId: string) {
        super(agentId, setupId, AgentRoles.PROVER);
    }

    public async pegOut(proof: bigint[]) {
        await this.setTemplates();
        await this.sendProof(proof);
    }

    public async process() {
        await this.setTemplates();

        // read all incoming transactions
        const incomingArray = await this.getIncoming();
        if (incomingArray.length == 0) {
            // nothing to do
            return;
        }

        const selectionPathUnparsed: Buffer[][] = [];
        const selectionPath: number[] = [];
        let proof: bigint[] = [];

        // examine each one
        for (const incoming of incomingArray) {
            const lastFlag = incoming == last(incomingArray);

            switch (incoming.template.name) {
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

            if (incoming.template.name.startsWith(TemplateNames.STATE)) {
                if (lastFlag) {
                    // did the timeout expire?
                    const timeoutSc = await this.checkTimeout(incoming);
                    if (timeoutSc) await this.sendStateUncontested(selectionPath.length);
                }
            }
            if (incoming.template.name.startsWith(TemplateNames.STATE_UNCONTESTED)) {
                // we won, mark it
                await this.db.markSetupPegoutSuccessful(this.setupId);
                break;
            }
            if (incoming.template.name.startsWith(TemplateNames.SELECT)) {
                const rawTx = incoming.received.raw;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                const selection = this.parseSelection(incoming);
                selectionPath.push(selection);
                if (lastFlag) {
                    if (selectionPath.length + 1 < iterations) await this.sendState(proof, selectionPath);
                    else await this.sendArgument(proof, selectionPath, selectionPathUnparsed);
                }
            }
            if (incoming.template.name.startsWith(TemplateNames.SELECT_UNCONTESTED)) {
                // we lost, mark it
                await this.db.markSetupPegoutFailed(this.setupId);
                break;
            }
        }
    }

    private async sendProof(proof: bigint[]) {
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }
        const data = proof
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.setup!.id, TemplateNames.PROOF, 0, 0, dataIndex))
            )
            .flat();
        await this.sendTransaction(TemplateNames.PROOF, [data]);
    }

    private async sendProofUncontested() {
        await this.sendTransaction(TemplateNames.PROOF_UNCONTESTED);
    }

    private async sendArgument(proof: bigint[], selectionPath: number[], selectionPathUnparsed: Buffer[][]) {
        const argument = new Argument(this.agentId, this.setup!.id, proof);
        const argumentData = await argument.makeArgument(selectionPath, selectionPathUnparsed);
        await this.sendTransaction(TemplateNames.ARGUMENT, argumentData);
    }

    private async sendArgumentUncontested() {
        await this.sendTransaction(TemplateNames.ARGUMENT_UNCONTESTED);
    }

    private async sendStateUncontested(iteration: number) {
        await this.sendTransaction(TemplateNames.STATE_UNCONTESTED + '_' + twoDigits(iteration));
    }

    private async sendState(proof: bigint[], selectionPath: number[]) {
        const iteration = selectionPath.length;
        const states = await calculateStates(proof, selectionPath);
        const txName = TemplateNames.STATE + '_' + twoDigits(iteration);
        const spendingConditionIndex = iteration == 0 ? 1 : 0;
        const statesWi = states
            .map((s, dataIndex) =>
                encodeWinternitz256_4(
                    bufferToBigintBE(s), 
                createUniqueDataId(this.setup!.id, txName, 0, spendingConditionIndex, dataIndex)))
            .flat();
        await this.sendTransaction(txName, [statesWi]);
    }
}

export async function main(agentId: string) {
    const doit = async () => {
        const db = new AgentDb(agentId);
        const setups = await db.getActiveSetups();
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
        await sleep(agentConf.protocolIntervalMs);
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
