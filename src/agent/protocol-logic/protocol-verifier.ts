import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { parseInputs } from './parser';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { findErrorState } from './states';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { Argument } from './argument';
import { last } from '../common/array-utils';
import { createUniqueDataId } from '../setup/wots-keys';
import { AgentRoles, TemplateNames } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { getTemplateByName, twoDigits } from '../common/templates';
import { Incoming, ProtocolBase } from './protocol-base';
import { defaultVerificationKey } from '../../generator/ec_vm/constants';
import { sleep } from '../common/sleep';

export class ProtocolVerifier extends ProtocolBase {
    constructor(agentId: string, setupId: string) {
        super(agentId, setupId, AgentRoles.VERIFIER);
    }

    public async process() {
        if (!this.templates) {
            this.templates = await this.db.getTemplates(this.setupId);
        }
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }

        // read all incoming transactions
        const incomingArray = await this.getIncoming();
        if (incomingArray.length == 0) {
            // nothing to do
            return;
        }

        const selectionPath: number[] = [];
        const selectionPathUnparsed: Buffer[][] = [];
        let proof: bigint[] = [];
        const states: Buffer[][] = [];

        // examine each one
        for (const incoming of incomingArray) {
            const lastFlag = incoming == last(incomingArray);

            switch (incoming.template.name) {
                case TemplateNames.PROOF:
                    proof = this.parseProof(incoming);
                    if (lastFlag && !this.checkProof(proof)) {
                        this.sendChallenge();
                    }
                    break;
                case TemplateNames.PROOF_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPegoutSuccessful(this.setupId);
                    break;
                case TemplateNames.CHALLENGE:
                    if (lastFlag) {
                        const proofTemplate = getTemplateByName(this.templates!, TemplateNames.PROOF);
                        const proofIncoming = incomingArray.find((i) => i.template.id == proofTemplate.id);
                        const timeoutSc = await this.checkTimeout(proofIncoming!);
                        if (timeoutSc) await this.sendChallengeUncontested();
                    }
                    break;
                case TemplateNames.CHALLENGE_UNCONTESTED:
                    // we won, mark it
                    await this.db.markSetupPegoutFailed(this.setupId);
                    break;
                case TemplateNames.ARGUMENT:
                    if (lastFlag) {
                        this.refuteArgument(proof, states, incoming);
                    }
                    break;
                case TemplateNames.ARGUMENT_UNCONTESTED:
                    // we lost, mark it
                    await this.db.markSetupPegoutSuccessful(this.setupId);
                    break;
            }

            if (incoming.template.name.startsWith(TemplateNames.STATE)) {
                const state = this.parseState(incoming);
                states.push(state);
                if (lastFlag) {
                    await this.sendSelect(proof, selectionPath, states);
                }
            } else if (incoming.template.name.startsWith(TemplateNames.STATE_UNCONTESTED)) {
                // we lost, mark it
                await this.db.markSetupPegoutSuccessful(this.setupId);
                break;
            } else if (incoming.template.name.startsWith(TemplateNames.SELECT)) {
                const selection = this.parseSelection(incoming);
                selectionPath.push(selection);
                const rawTx = incoming.received.raw;
                selectionPathUnparsed.push(rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex')));
                if (lastFlag) {
                    const timeoutSc = await this.checkTimeout(incoming);
                    if (timeoutSc) await this.sendSelectUncontested(selectionPath.length);
                }
            } else if (incoming.template.name.startsWith(TemplateNames.SELECT_UNCONTESTED)) {
                // we won, mark it
                await this.db.markSetupPegoutFailed(this.setupId);
                break;
            }
        }
    }

    private checkProof(proof: bigint[]): boolean {
        step1_vm.reset();
        groth16Verify(Key.fromSnarkjs(defaultVerificationKey), Step1_Proof.fromWitness(proof));
        return step1_vm.success?.value === 1n;
    }

    private async refuteArgument(proof: bigint[], states: Buffer[][], incoming: Incoming) {
        const rawTx = incoming.received.raw;
        const witnesses = 
            rawTx.vin.map(vin => vin.txinwitness!.map((s) => Buffer.from(s, 'hex')));
        const argData = parseInputs(this.templates!, incoming.template.inputs, witnesses);
        const argument = new Argument(this.agentId, this.setup!.id, proof);
        const refutation = await argument.refute(argData, states);

        incoming.template.inputs[0].script = refutation.script;
        incoming.template.inputs[0].controlBlock = refutation.controlBlock;

        await this.db.upsertTemplates(this.setupId, [incoming.template]);

        const data = refutation.data
            .map((n, dataIndex) =>
                encodeWinternitz256_4(
                    n,
                    createUniqueDataId(this.setup!.id, TemplateNames.PROOF_REFUTED, 0, 0, dataIndex)
                )
            )
            .flat();
        this.sendTransaction(TemplateNames.PROOF_REFUTED, [data]);
    }

    private async sendSelect(proof: bigint[], selectionPath: number[], states: Buffer[][]) {
        const iteration = selectionPath.length;
        const txName = TemplateNames.SELECT + '_' + twoDigits(iteration);
        const selection = await findErrorState(proof, last(states), selectionPath);
        const selectionWi = encodeWinternitz24(BigInt(selection), createUniqueDataId(this.setup!.id, txName, 0, 0, 0));
        this.sendTransaction(txName, [selectionWi]);
    }

    private async sendChallenge() {
        await this.sendTransaction(TemplateNames.CHALLENGE);
    }

    private async sendChallengeUncontested() {
        await this.sendTransaction(TemplateNames.CHALLENGE_UNCONTESTED);
    }

    private async sendSelectUncontested(iteration: number) {
        await this.sendTransaction(TemplateNames.SELECT_UNCONTESTED + '_' + twoDigits(iteration));
    }
}

export async function main(agentId: string) {
    const doit = async () => {
        const db = new AgentDb(agentId);
        const setups = await db.getActiveSetups();
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
        await sleep(agentConf.protocolIntervalMs);
        /*eslint no-constant-condition: "off"*/
    } while (true);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args._[0] ?? args['agent-id'] ?? 'bitsnark_verifier_1';
    main(agentId).catch((error) => {
        throw error;
    });
}
