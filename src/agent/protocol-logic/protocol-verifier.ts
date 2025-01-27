import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { parseInputs } from './parser';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { findErrorState } from './states';
import { encodeWinternitz24 } from '../common/winternitz';
import { refute } from './argument';
import { last } from '../common/array-utils';
import { createUniqueDataId } from '../setup/wots-keys';
import { AgentRoles, TemplateNames, TemplateStatus, WitnessAndValue } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { getTemplateByName, twoDigits } from '../common/templates';
import { Incoming, ProtocolBase } from './protocol-base';
import { defaultVerificationKey } from '../../generator/ec_vm/constants';
import { sleep } from '../common/sleep';
import { Bitcoin, executeProgram } from '../../../src/generator/btc_vm/bitcoin';

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
        const incomingArray = (await this.getIncoming()).filter((t) => !t.template.isExternal);
        if (incomingArray.length == 0) {
            // nothing to do
            return;
        }

        const selectionPath: number[] = [];
        const selectionPathUnparsed: Buffer[][] = [];
        let proof: bigint[] = [];
        const states: WitnessAndValue[][] = [];

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
                        const status = await this.getTemplateStatus(TemplateNames.PROOF_REFUTED);
                        if (status == TemplateStatus.REJECTED) {
                            // We lost, mark it.
                            await this.db.markSetupPegoutSuccessful(this.setupId);
                        } else if (status == TemplateStatus.PENDING) {
                            await this.refuteArgument(proof, states, incoming);
                        }
                    }
                    break;
                case TemplateNames.ARGUMENT_UNCONTESTED:
                    // we lost, mark it.
                    await this.db.markSetupPegoutSuccessful(this.setupId);
                    break;
                case TemplateNames.PROOF_REFUTED:
                    // We won! Mark it.
                    await this.db.markSetupPegoutFailed(this.setupId);
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
                const selection = this.parseSelection(incoming, selectionPathUnparsed);
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
        const success = step1_vm.success?.value === 1n;
        console.log('PROOF CHECKS: ', success);
        return success;
    }

    private async refuteArgument(proof: bigint[], states: WitnessAndValue[][], incoming: Incoming) {
        const rawTx = incoming.received.raw;
        const witnesses = rawTx.vin.map((vin) => vin.txinwitness!.map((s) => Buffer.from(s, 'hex')));
        const argData = parseInputs(this.templates!, incoming.template.inputs, witnesses);

        const refutation = await refute(this.agentId, this.setupId, proof, argData, states);

        // Add the script to the refutation template.
        const refutationTemplate = getTemplateByName(this.templates!, TemplateNames.PROOF_REFUTED);
        refutationTemplate.inputs[0].script = refutation.script;
        refutationTemplate.inputs[0].controlBlock = refutation.controlBlock;
        await this.db.upsertTemplates(this.setupId, [refutationTemplate]);

        const bitcoin = new Bitcoin();
        const data = refutation.data.map((wav) => wav.witness!).flat();
        data.forEach((b) => bitcoin.addWitness(b!));
        bitcoin.addWitness(Buffer.alloc(64));
        bitcoin.throwOnFail = true;
        console.log('!!!!!!!!!!!!!!!! Executing....');
        executeProgram(bitcoin, refutation.script, true);

        this.sendTransaction(TemplateNames.PROOF_REFUTED, [data]);
    }

    private async sendSelect(proof: bigint[], selectionPath: number[], states: WitnessAndValue[][]) {
        const iteration = selectionPath.length;
        const txName = `${TemplateNames.SELECT}_${twoDigits(iteration)}` as TemplateNames;
        const selection = await findErrorState(proof, states, selectionPath);
        if (selection < 0) throw new Error('Could not find error state');
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
        await this.sendTransaction(`${TemplateNames.SELECT_UNCONTESTED}_${twoDigits(iteration)}` as TemplateNames);
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
        await doit();
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
