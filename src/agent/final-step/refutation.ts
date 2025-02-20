import { ScriptTemplate, Bitcoin } from '../../../src/generator/btc_vm/bitcoin';
import { StackItem } from '../../../src/generator/btc_vm/stack';
import { InstrCode } from '../../../src/generator/ec_vm/vm/types';
import { getSpendingConditionByInput, getTemplateByName, twoDigits } from '../common/templates';
import { Template, TemplateNames } from '../common/types';
import { encodeWinternitz24, encodeWinternitz256_4_lp, getWinternitzPublicKeys, WotsType } from '../common/winternitz';
import { bigintToNibbles_3 } from './nibbles';
import { Decasector } from '../setup/decasector';
import { checkLineBitcoin } from './check-line';
import { BLAKE3, Register } from './blake-3-4u';
import { chunk } from '../common/array-utils';

export const scriptTotalLines = 400001;

export enum RefutationType {
    INSTR,
    HASH
}

export const totalRefutationProofs = 3;
export const totalRefutationHashOptions = 7;

export interface RefutationDescriptor {
    refutationType: RefutationType;
    line: number;
    whichProof?: number;
    whichHashOption?: number;
}

export function getMaxRefutationIndex(): number {
    return (
        scriptTotalLines +
        scriptTotalLines * totalRefutationProofs * totalRefutationHashOptions +
        totalRefutationHashOptions
    );
}

export function getRefutationIndex(refutation: RefutationDescriptor): number {
    refutation = { ...refutation, line: Math.min(refutation.line, scriptTotalLines) };
    if (refutation.refutationType == RefutationType.INSTR) return refutation.line;
    else if (refutation.refutationType == RefutationType.HASH) {
        if (refutation.whichProof == undefined || refutation.whichHashOption == undefined)
            throw new Error('Missing whichProof or whichHash');
        if (refutation.whichProof < 0 || refutation.whichProof >= totalRefutationProofs)
            throw new Error('Invalid whichProof');
        if (refutation.whichHashOption < 0 || refutation.whichHashOption >= totalRefutationHashOptions)
            throw new Error('Invalid whichHashOption');

        return (
            scriptTotalLines +
            refutation.line * totalRefutationHashOptions * totalRefutationProofs +
            refutation.whichProof * totalRefutationHashOptions +
            refutation.whichHashOption
        );
    } else throw new Error('Unknown refutation type');
}

export function getRefutationDescriptor(index: number): RefutationDescriptor {
    if (index >= getMaxRefutationIndex()) throw new Error('Refutarion index too large');
    if (index < scriptTotalLines) {
        return { refutationType: RefutationType.INSTR, line: index };
    }
    index -= scriptTotalLines;
    const line = Math.floor(index / (totalRefutationProofs * totalRefutationHashOptions));
    index -= line * totalRefutationProofs * totalRefutationHashOptions;
    const whichProof = Math.floor(index / totalRefutationHashOptions);
    index -= whichProof * totalRefutationHashOptions;
    const whichHashOption = index;
    return { refutationType: RefutationType.HASH, line, whichProof, whichHashOption };
}

const scriptTemplateCache: { [key: string]: ScriptTemplate } = {};

function renderTemplateWithLine(template: ScriptTemplate, line: number): Buffer {
    const nibbles = bigintToNibbles_3(BigInt(line), 8);
    const map: { [key: string]: number } = {};
    for (let i = 0; i < nibbles.length; i++) {
        map[`indexNibbles_${i}`] = nibbles[i];
    }
    template.items.forEach((item) => {
        const b = Buffer.from([map[item.itemId]]);
        b.copy(template.buffer, item.index, 0, 1);
    });
    return template.buffer;
}

function generateRefuteInstructionScriptTemplate(
    decasector: Decasector,
    templates: Template[],
    line: number
): ScriptTemplate {
    const lastSelect = getTemplateByName(templates, `${TemplateNames.SELECT}_${twoDigits(decasector.iterations - 1)}`);
    const instr = decasector.savedVm.program[line];

    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = false;

    const indexWitness = encodeWinternitz24(BigInt(line), '').map((b) => bitcoin.addWitness(b));

    const w_a = encodeWinternitz256_4_lp(0n, '').map((b) => bitcoin.addWitness(b));
    const w_b = encodeWinternitz256_4_lp(0n, '').map((b) => bitcoin.addWitness(b));
    const w_c = encodeWinternitz256_4_lp(0n, '').map((b) => bitcoin.addWitness(b));
    let w_d: StackItem[] | undefined;
    if (instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD) {
        w_d = encodeWinternitz256_4_lp(0n, '').map((b) => bitcoin.addWitness(b));
    }

    const sc = lastSelect?.outputs[0].spendingConditions[0];
    // check verifier sig
    if (!sc || !sc.signaturesPublicKeys || !sc.signaturesPublicKeys[0]) {
        throw new Error('No schnorr public key for verifier in last select template');
    }
    bitcoin.addWitness(Buffer.alloc(64));
    bitcoin.verifySignature(sc.signaturesPublicKeys[0]);

    // first output is the index
    bitcoin.verifyIndex(
        indexWitness,
        lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0],
        bigintToNibbles_3(BigInt(line), 8)
    );
    bitcoin.drop(indexWitness);

    // a is the first element in the second output
    const a_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(a_4, w_a, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![0]);
    bitcoin.drop(w_a);
    const a = bitcoin.nibbles4To3(a_4);
    bitcoin.drop(a_4);

    // b is the second element in the second output
    const b_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(b_4, w_b, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![1]);
    bitcoin.drop(w_b);
    const b = bitcoin.nibbles4To3(b_4);
    bitcoin.drop(b_4);

    // c is the third element in the second output
    const c_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(c_4, w_c, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![2]);
    bitcoin.drop(w_c);
    const c = bitcoin.nibbles4To3(c_4);
    bitcoin.drop(c_4);

    // d is the fourth element second output
    let d: StackItem[];
    if (w_d) {
        const d_4 = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_listpick4(d_4, w_d, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![3]);
        bitcoin.drop(w_d);
        d = bitcoin.nibbles4To3(d_4);
        bitcoin.drop(d_4);
    }

    checkLineBitcoin(bitcoin, instr, a, b, c, d!);
    const scriptTemplate = bitcoin.programToTemplate();
    return scriptTemplate;
}

function generateRefuteInstructionScript(
    decasector: Decasector,
    templates: Template[],
    refutation: RefutationDescriptor
): Buffer {
    const instr = decasector.savedVm.program[refutation.line];
    const cacheKey = `${instr.name}/${instr.bit ?? 0}`;
    if (scriptTemplateCache[cacheKey]) return renderTemplateWithLine(scriptTemplateCache[cacheKey], refutation.line);
    const template = generateRefuteInstructionScriptTemplate(decasector, templates, refutation.line);
    scriptTemplateCache[cacheKey] = template;
    const script = renderTemplateWithLine(template, refutation.line);
    return script;
}

function negifyPairHash(
    blake3: BLAKE3,
    leftNibbles: StackItem[],
    rightNibbles: StackItem[],
    resultNibbles: StackItem[]
) {
    const rightRegs: Register[] = blake3.nibblesToRegisters(rightNibbles);
    const leftRegs: Register[] = blake3.nibblesToRegisters(leftNibbles);
    const resultRegs: Register[] = blake3.nibblesToRegisters(resultNibbles);

    const hashRegs = blake3.hash([...leftRegs, ...rightRegs]);
    blake3.bitcoin.drop([...leftRegs, ...rightRegs].flat());

    const temp = blake3.bitcoin.newStackItem(0);
    blake3.bitcoin.equalNibbles(temp, resultRegs.flat(), hashRegs.flat());
    blake3.bitcoin.drop(resultRegs.flat());
    blake3.bitcoin.drop(hashRegs.flat());
    blake3.bitcoin.assertZero(temp);
    blake3.bitcoin.drop(temp);
}

export async function createRefuteHashScriptTemplate(
    verifierSchnorrPublicKey: Buffer,
    wotsPublicKeys?: Buffer[][],
    witness?: Buffer[][]
): Promise<ScriptTemplate> {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;

    const leftKeys = wotsPublicKeys ? wotsPublicKeys[0] : getWinternitzPublicKeys(WotsType._256_4_LP, '0');
    const rightKeys = wotsPublicKeys ? wotsPublicKeys[1] : getWinternitzPublicKeys(WotsType._256_4_LP, '1');
    const resultKeys = wotsPublicKeys ? wotsPublicKeys[2] : getWinternitzPublicKeys(WotsType._256_4_LP, '2');

    const leftWi = (witness ? witness[0] : encodeWinternitz256_4_lp(0n, '0')).map((b) => bitcoin.addWitness(b));
    const rightWi = (witness ? witness[1] : encodeWinternitz256_4_lp(1n, '1')).map((b) => bitcoin.addWitness(b));
    const resultWi = (witness ? witness[2] : encodeWinternitz256_4_lp(2n, '2')).map((b) => bitcoin.addWitness(b));

    bitcoin.addWitness(Buffer.alloc(64));
    bitcoin.verifySignature(verifierSchnorrPublicKey);

    const leftSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(leftSi, leftWi, leftKeys);
    bitcoin.drop(leftWi);

    const rightSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(rightSi, rightWi, rightKeys);
    bitcoin.drop(rightWi);

    const resultSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_listpick4(resultSi, resultWi, resultKeys);
    bitcoin.drop(resultWi);

    bitcoin.setBreakPoint();

    const blake3 = new BLAKE3(bitcoin);
    blake3.initializeTables();

    bitcoin.setBreakPoint();

    negifyPairHash(blake3, rightSi, leftSi, resultSi);

    return bitcoin.programToTemplate({ validateStack: true });
}

export function renderScriptTemplateWithKeys(scriptTemplate: ScriptTemplate, keys: Buffer[][]): Buffer {
    const keysFlat = keys.flat();
    for (let i = 0; i < scriptTemplate.items.length; i++) {
        const item = scriptTemplate.items[i];
        const b = keysFlat[i];
        b.copy(scriptTemplate.buffer, item.index, 0);
    }
    return scriptTemplate.buffer;
}

async function generateRefuteMerkleProofScript(
    decasector: Decasector,
    templates: Template[],
    refutationDescriptor: RefutationDescriptor
): Promise<Buffer> {
    if (refutationDescriptor.whichProof == undefined) throw new Error('Missing whichProof');
    if (refutationDescriptor.whichHashOption == undefined) throw new Error('Missing whichHashOption');

    // TODO: better validation
    if (refutationDescriptor.line == 0) return Buffer.alloc(0);

    // first find the 2 roots for the 3 merkle proofs
    const stateCommitmentBefore = decasector.stateCommitmentByLine[refutationDescriptor.line];
    const stateCommitmentAfter = decasector.stateCommitmentByLine[refutationDescriptor.line + 1];

    // transaction names start with 0 while state commitment count starts with 1, so -1 here
    const beforeStateIteration = stateCommitmentBefore.iteration - 1;
    const afterStateIteration = stateCommitmentAfter.iteration - 1;
    const stateCommitmentIndexBefore = stateCommitmentBefore.selection;
    const stateCommitmentIndexAfter = stateCommitmentAfter.selection;

    // TODO: better validation
    if (beforeStateIteration < 0) return Buffer.alloc(0);

    const stateTxBefore = getTemplateByName(templates, `${TemplateNames.STATE}_${twoDigits(beforeStateIteration)}`);
    const wotsPublicKeysBefore = stateTxBefore.inputs
        .map((input) => {
            const scBefore = getSpendingConditionByInput(templates, input);
            return scBefore.wotsPublicKeys;
        })
        .flat();
    const beforeRootKeys = wotsPublicKeysBefore[stateCommitmentIndexBefore];

    const stateTxAfter = getTemplateByName(templates, `${TemplateNames.STATE}_${twoDigits(afterStateIteration)}`);
    const wotsPublicKeysAfter = stateTxAfter.inputs
        .map((input) => {
            const scBefore = getSpendingConditionByInput(templates, input);
            return scBefore.wotsPublicKeys;
        })
        .flat();
    const afterRootKeys = wotsPublicKeysAfter[stateCommitmentIndexAfter];

    // now let's get the merkle proofs keys, there are 3 proofs
    const merkleProofKeysAll: Buffer[][] = [];
    const argument = getTemplateByName(templates, TemplateNames.ARGUMENT);

    // We need all of the inputs except the first two, which are the path and the a, b, c, d values
    for (let i = 2; i < argument.inputs.length; i++) {
        const input = argument.inputs[i];
        const sc = getSpendingConditionByInput(templates, input);
        merkleProofKeysAll.push(...sc.wotsPublicKeys!);
    }
    // divide these into 3 sets of 13
    const merkleProofKeys: Buffer[][][] = chunk(merkleProofKeysAll, 13);

    // now add the value before the proof, and the root after it
    {
        const sc = getSpendingConditionByInput(templates, argument.inputs[1]);
        merkleProofKeys[0].unshift(sc.wotsPublicKeys![0]); // a
        merkleProofKeys[1].unshift(sc.wotsPublicKeys![1]); // b
        merkleProofKeys[2].unshift(sc.wotsPublicKeys![2]); // c

        merkleProofKeys[0].push(beforeRootKeys!);
        merkleProofKeys[1].push(beforeRootKeys!);
        merkleProofKeys[2].push(afterRootKeys!);
    }

    let scriptTemplate = scriptTemplateCache['hash'];
    if (!scriptTemplate) {
        const argumentTemplate = getTemplateByName(templates, `${TemplateNames.ARGUMENT}`);
        if (!argumentTemplate?.outputs[0]?.spendingConditions[0]?.signaturesPublicKeys![0])
            throw new Error('Missing verifier schnorr public key');
        scriptTemplate = await createRefuteHashScriptTemplate(
            argumentTemplate.outputs[0].spendingConditions[0].signaturesPublicKeys![0]
        );
        scriptTemplateCache['hash'] = scriptTemplate;
    }

    // here's the script to refute one hash
    const refuteHash = async (leftKeys: Buffer[], rightKeys: Buffer[], resultKeys: Buffer[]): Promise<Buffer> => {
        const keys = [leftKeys, rightKeys, resultKeys];
        return renderScriptTemplateWithKeys(scriptTemplate!, keys);
    };

    const script = await refuteHash(
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHashOption * 2 + 0],
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHashOption * 2 + 1],
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHashOption * 2 + 2]
    );

    return script;
}

export async function createRefutationScript(
    decasector: Decasector,
    templates: Template[],
    refutation: RefutationDescriptor
): Promise<Buffer> {
    if (refutation.refutationType == RefutationType.INSTR) {
        return generateRefuteInstructionScript(decasector, templates, refutation);
    } else if (refutation.refutationType == RefutationType.HASH) {
        return await generateRefuteMerkleProofScript(decasector, templates, refutation);
    } else throw new Error('Unknown refutation type');
}
