import { Bitcoin } from '../../generator/btc_vm/bitcoin';
import { encodeWinternitz, WOTS_NIBBLES, WOTS_OUTPUT, WotsType } from '../common/winternitz';
import { StackItem } from '../../generator/btc_vm/stack';
import { SimpleTapTree } from '../common/taptree';
import { agentConf } from '../agent.conf';
import { Buffer } from 'node:buffer';
import { DoomsdayGenerator } from '../final-step/doomsday-generator';
import { AgentRoles, Input, SpendingCondition, Template, TemplateNames } from '../common/types';
import { getSpendingConditionByInput, getTemplateByName } from '../common/templates';
import { AgentDb } from '../common/agent-db';
import { createHash } from 'node:crypto';
import { array } from '../common/array-utils';

const DEAD_SCRIPT = Buffer.from([0x6a]); // opcode fails transaction

function findInputsByOutput(
    transactions: Template[],
    name: string,
    outputIndex: number,
    spendingConditionIndex: number
): Input[] {
    return transactions
        .map((t) =>
            t.inputs.filter(
                (i) =>
                    i.templateName == name &&
                    i.outputIndex == outputIndex &&
                    i.spendingConditionIndex == spendingConditionIndex
            )
        )
        .flat();
}

function setTaprootKey(transactions: Template[]) {
    for (const t of transactions) {
        if (t.name === 'ARGUMENT') {
            console.warn('Refusing to setTaprootKey for ARGUMENT');
            continue;
        }
        for (let outputIndex = 0; outputIndex < t.outputs.length; outputIndex++) {
            const output = t.outputs[outputIndex];
            const scripts = output.spendingConditions.map((sc, scIndex) => {
                const inputs = findInputsByOutput(transactions, t.name, outputIndex, scIndex);
                return inputs.length && inputs[0].script ? inputs[0].script : DEAD_SCRIPT;
            });
            const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
            output.taprootKey = stt.getTaprootOutput();

            for (const [scIndex, sc] of output.spendingConditions.entries()) {
                try {
                    sc.controlBlock = stt.getControlBlock(scIndex);
                } catch (error) {
                    throw new Error(
                        `No control block for: ${t.name}, output: ${outputIndex}, sc: ${scIndex}. ${error}`
                    );
                }
            }
        }
    }
}

export function generateSpendLockedFundsScript(setupId: string, schnorrKeys: Buffer[]): Buffer {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;

    // Add check for both signatures

    for (const key of schnorrKeys) {
        bitcoin.addWitness(Buffer.from(new Array(64)));
        bitcoin.verifySignature(key);
    }

    // Add the setupId in so that the result is globally unique
    bitcoin.DATA(createHash('sha256').update(setupId, 'ascii').digest());

    const script = bitcoin.programToBinary();
    return script;
}

export function generateBoilerplate(myRole: AgentRoles, spendingCondition: SpendingCondition): Buffer {
    const bitcoin = new Bitcoin();

    bitcoin.throwOnFail = spendingCondition.nextRole == myRole;

    if (spendingCondition.timeoutBlocks) {
        bitcoin.checkTimeout(spendingCondition.timeoutBlocks);
    }

    let witnessSIs: StackItem[][] = [];
    if (spendingCondition.wotsSpec) {
        if (spendingCondition.exampleWitness) {
            witnessSIs = spendingCondition.exampleWitness.map((values) => values.map((b) => bitcoin.addWitness(b)));
        } else {
            witnessSIs = spendingCondition.wotsSpec
                .map((spec) => encodeWinternitz(spec, 0n, ''))
                .map((values) => values.map((b) => bitcoin.addWitness(b)));
        }
    }

    if (spendingCondition.signaturesPublicKeys) {
        for (const _ of spendingCondition.signaturesPublicKeys) {
            bitcoin.addWitness(Buffer.from(new Array(64)));
        }
        for (const key of spendingCondition.signaturesPublicKeys) {
            bitcoin.verifySignature(key);
        }
    }

    if (spendingCondition.wotsSpec) {
        const keys = spendingCondition.wotsPublicKeys!;
        const decoders = {
            [WotsType._256]: (dataIndex: number) => bitcoin.winternitzCheck256(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._256_4]: (dataIndex: number) =>
                bitcoin.winternitzCheck256_4(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._24]: (dataIndex: number) => bitcoin.winternitzCheck24(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._1]: (dataIndex: number) => bitcoin.winternitzCheck1(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._256_4_LP]: (dataIndex: number) => bitcoin.winternitzCheck256_listpick4(witnessSIs[dataIndex], keys[dataIndex])
        };
        for (const [dataIndex, spec] of spendingCondition.wotsSpec.entries()) {
            if (witnessSIs[dataIndex].length != WOTS_OUTPUT[spec]) {
                throw new Error('size mismatch');
            }
            decoders[spec](dataIndex);
            bitcoin.drop(witnessSIs[dataIndex]);
        }
    }

    return bitcoin.programToBinary();
}

export function generateProcessSelectionPath(sc: SpendingCondition): Buffer {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;

    const pubKeys = sc.wotsPublicKeys!;
    const exampleWitness = sc.exampleWitness ? sc.exampleWitness : sc.wotsPublicKeys;

    if (sc.signaturesPublicKeys) {
        for (const key of sc.signaturesPublicKeys) {
            bitcoin.addWitness(Buffer.from(new Array(64)));
            bitcoin.verifySignature(key);
        }
    }

    const pathWitness: StackItem[][] = [];
    for (let i = 0; i < exampleWitness!.length; i++) {
        pathWitness[i] = exampleWitness![i].map((b) => bitcoin.addWitness(b));
    }

    const pathNibbles: StackItem[][] = [];
    for (let i = 0; i < pathWitness.length; i++) {
        const result = bitcoin.newNibbles(8);
        pathNibbles.push(result);
        bitcoin.winternitzDecode24(result, pathWitness[i], pubKeys[i]);
        bitcoin.drop(pathWitness[i]);
    }

    bitcoin.checkSemiFinal(pathNibbles.slice(0, 6), pathNibbles[6]);
    bitcoin.drop(pathNibbles.flat());

    return bitcoin.programToBinary();
}

export async function generateAllScripts(
    agentId: string,
    setupId: string,
    myRole: AgentRoles,
    templates: Template[],
    generateFinal: boolean
): Promise<Template[]> {
    for (const t of templates.filter((t) => !t.isExternal)) {
        // check that all sc have wots public keys if they need them
        for (const output of t.outputs) {
            for (const sc of output.spendingConditions) {
                if (!sc.wotsSpec) break;
                if (!sc.wotsPublicKeys) throw new Error('Missing keys');
                if (sc.wotsSpec.length != sc.wotsPublicKeys.length) throw new Error('Invalid keys length 1');
                sc.wotsSpec.forEach((spec, dataIndex) => {
                    if (sc.wotsPublicKeys![dataIndex].length != WOTS_NIBBLES[spec])
                        throw new Error('Invaid keys length 2');
                });
            }
        }

        if (t.name == TemplateNames.PROOF_REFUTED) {
            const ddg = new DoomsdayGenerator(agentId, setupId);
            let taproot;

            // TODO: remove before merge!!!!!

            generateFinal = false;

            if (generateFinal) {
                taproot = (await ddg.generateFinalStepTaprootParallel()).taprootPubKey;
            } else {
                const mockSTT = new SimpleTapTree(agentConf.internalPubkey, [DEAD_SCRIPT, DEAD_SCRIPT]);
                taproot = mockSTT.getTaprootOutput();
            }

            const argument = getTemplateByName(templates, TemplateNames.ARGUMENT);
            if (argument.outputs.length != 1) throw new Error('Wrong number of outputs');
            argument.outputs[0].taprootKey = taproot;
        } else {
            for (const input of t.inputs) {
                const prevT = getTemplateByName(templates, input.templateName);
                const prevOutput = prevT.outputs[input.outputIndex];
                const sc = prevOutput.spendingConditions[input.spendingConditionIndex];

                let script;

                // the first input of the argument is different
                if (t.name == TemplateNames.ARGUMENT && input.index == 0) {
                    script = generateProcessSelectionPath(sc);
                }
                // TODO: testing
                // else if (t.name == TemplateNames.ARGUMENT && input.index == 1) {
                //     const foo: number[] = array(538, 117);
                //     foo.push(81);
                //     script = Buffer.from(foo);
                // }
                // The locked funds is different
                else if (input.templateName == TemplateNames.LOCKED_FUNDS) {
                    const sc = getSpendingConditionByInput(templates, input);
                    script = generateSpendLockedFundsScript(setupId, sc.signaturesPublicKeys!);
                }
                // The rest...
                else {
                    const sc = getSpendingConditionByInput(templates, input);
                    script = generateBoilerplate(myRole, sc);
                }

                sc.script = script;
                input.script = script;
            }
        }
    }

    // copy scripts from spending conditions to matching inputs
    for (const transaction of templates) {
        if (transaction.name == TemplateNames.PROOF_REFUTED) continue;
        for (const input of transaction.inputs) {
            const prev = getTemplateByName(templates, input.templateName);
            if (!prev || input.outputIndex >= prev.outputs.length) throw new Error("Input doesn't match any outputs");
            const output = prev.outputs[input.outputIndex];
            const spendingCondition = output.spendingConditions[input.spendingConditionIndex];
            if (!spendingCondition) throw new Error("Input doesn't match any spending conditions");
            if (!spendingCondition.script) throw new Error('Script in spending condition is missing');
            input.script = spendingCondition.script;
        }
    }

    // generate the taproot key for all outputs except in the argument tx
    setTaprootKey(templates);

    return templates;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const generateFinal = process.argv.some((s) => s == '--final');
    const db = new AgentDb(agentId);
    const bareTemplates = await db.getTemplates(setupId);
    const templates = await generateAllScripts(agentId, setupId, AgentRoles.PROVER, bareTemplates, generateFinal);
    await db.upsertTemplates(setupId, templates);
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
