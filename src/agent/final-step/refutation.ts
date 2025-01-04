import { ScriptTemplate, Bitcoin } from '../../../src/generator/btc_vm/bitcoin';
import { StackItem } from '../../../src/generator/btc_vm/stack';
import { InstrCode } from '../../../src/generator/ec_vm/vm/types';
import { getSpendingConditionByInput, getTemplateByName, twoDigits } from '../common/templates';
import { Template, TemplateNames } from '../common/types';
import { encodeWinternitz24, encodeWinternitz256_4, getWinternitzPublicKeys, WotsType } from '../common/winternitz';
import { bigintToNibbles_3 } from './nibbles';
import { Decasector } from '../setup/decasector';
import { checkLineBitcoin } from './check-line';
import { BLAKE3, Register } from './blake-3-4u';
import { blake3 as blake3_wasm } from 'hash-wasm';
import { bufferToBigintBE } from '../common/encoding';

export enum RefutationType {
    INSTR,
    HASH
}

export const totalRefutationProofs = 3;
export const totalRefutationHashes = 8;

export interface RefutationDescriptor {
    refutationType: RefutationType;
    line: number;
    totalLines: number;
    whichProof?: number;
    whichHash?: number;
}

const scriptTampleCache: { [key: string]: ScriptTemplate } = {};

function renderTemplateWithIndex(template: ScriptTemplate, index: number): Buffer {
    const nibbles = bigintToNibbles_3(BigInt(index), 8);
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

    const w_a = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
    const w_b = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
    const w_c = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
    let w_d: StackItem[] | undefined;
    if (instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD) {
        w_d = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
    }

    // first output is the index
    bitcoin.verifyIndex(
        indexWitness,
        lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0],
        bigintToNibbles_3(BigInt(line), 8)
    );
    bitcoin.drop(indexWitness);

    // a is the first element in the second output
    const a_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(a_4, w_a, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![0]);
    bitcoin.drop(w_a);
    const a = bitcoin.nibbles4To3(a_4);
    bitcoin.drop(a_4);

    // b is the second element in the second output
    const b_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(b_4, w_b, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![1]);
    bitcoin.drop(w_b);
    const b = bitcoin.nibbles4To3(b_4);
    bitcoin.drop(b_4);

    // c is the third element in the second output
    const c_4 = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(c_4, w_c, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![2]);
    bitcoin.drop(w_c);
    const c = bitcoin.nibbles4To3(c_4);
    bitcoin.drop(c_4);

    // d is the fourth element second output
    let d: StackItem[];
    if (w_d) {
        const d_4 = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(d_4, w_d, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![3]);
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
    if (scriptTampleCache[cacheKey]) return renderTemplateWithIndex(scriptTampleCache[cacheKey], refutation.line);
    const template = generateRefuteInstructionScriptTemplate(decasector, templates, refutation.line);
    scriptTampleCache[cacheKey] = template;
    const script = renderTemplateWithIndex(template, refutation.line);
    return script;
}

export function getMaxRefutationIndex(decasector: Decasector): number {
    return decasector.total + decasector.total * totalRefutationProofs * totalRefutationHashes;
}

export function getRefutationIndex(refutation: RefutationDescriptor): number {
    if (refutation.refutationType == RefutationType.INSTR) return refutation.line;
    else if (refutation.refutationType == RefutationType.HASH) {
        if (refutation.whichProof == undefined || refutation.whichHash == undefined)
            throw new Error('Missing whichProof or whichHash');
        if (refutation.whichProof < 0 || refutation.whichProof >= totalRefutationProofs)
            throw new Error('Invalid whichProof');
        if (refutation.whichHash < 0 || refutation.whichHash >= totalRefutationHashes)
            throw new Error('Invalid whichHash');

        return (
            refutation.totalLines +
            refutation.line * totalRefutationHashes * totalRefutationProofs +
            refutation.whichProof * totalRefutationHashes +
            refutation.whichHash
        );
    } else throw new Error('Unknown refutation type');
}

export function getRefutationDescriptor(decasector: Decasector, index: number): RefutationDescriptor {
    if (index < decasector.total)
        return { refutationType: RefutationType.INSTR, line: index, totalLines: decasector.total };
    index -= decasector.total;
    const line = Math.floor(index / (totalRefutationProofs * totalRefutationHashes));
    index -= line * totalRefutationProofs * totalRefutationHashes;
    const whichProof = Math.floor(index / totalRefutationHashes);
    index -= whichProof * totalRefutationHashes;
    const whichHash = index;
    return { refutationType: RefutationType.HASH, line, totalLines: decasector.total, whichProof, whichHash };
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

async function createRefuteHashScriptTemplate(): Promise<ScriptTemplate> {
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;
    const blake3 = new BLAKE3(bitcoin);
    blake3.initializeTables();

    const leftKeys = getWinternitzPublicKeys(WotsType._256_4, '');
    const rightKeys = getWinternitzPublicKeys(WotsType._256_4, '');
    const resultKeys = getWinternitzPublicKeys(WotsType._256_4, '');

    // mock values for self testing code
    const left = '12341234';
    const right = '98769876';
    const result = Buffer.from(
        await blake3_wasm(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')])),
        'hex'
    );

    const leftWi = encodeWinternitz256_4(BigInt('0x' + left), '').map((b) => bitcoin.addWitness(b));
    const rightWi = encodeWinternitz256_4(BigInt('0x' + right), '').map((b) => bitcoin.addWitness(b));
    const resultWi = encodeWinternitz256_4(bufferToBigintBE(result), '').map((b) => bitcoin.addWitness(b));

    const leftSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(leftSi, leftWi, leftKeys);
    bitcoin.drop(leftWi);

    const rightSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(rightSi, rightWi, rightKeys);
    bitcoin.drop(rightWi);

    const resultSi = bitcoin.newNibbles(64);
    bitcoin.winternitzDecode256_4(resultSi, resultWi, resultKeys);
    bitcoin.drop(resultWi);

    negifyPairHash(blake3, rightSi, leftSi, resultSi);
    return bitcoin.programToTemplate({ validateStack: true });
}

function renderScriptTemplateWithKeys(scriptTemplate: ScriptTemplate, keys: Buffer[][]): Buffer {
    const keysFlat = keys.flat();
    scriptTemplate.items.forEach((item, i) => {
        const b = keysFlat[i];
        b.copy(scriptTemplate.buffer, item.index, 0);
    });
    return scriptTemplate.buffer;
}

async function generateRefuteMerkleProofScript(
    decasector: Decasector,
    templates: Template[],
    refutationDescriptor: RefutationDescriptor
): Promise<Buffer> {
    if (refutationDescriptor.whichProof == undefined) throw new Error('Missing whichProof');
    if (refutationDescriptor.whichHash == undefined) throw new Error('Missing whichHash');

    // TODO: what to do if the line is 0?
    if (refutationDescriptor.line == 0) return Buffer.alloc(0);

    // first find the 2 roots for the 3 merkle proofs
    const stateCommitmentBefore = decasector.stateCommitmentByLine[refutationDescriptor.line - 1];
    const stateCommitmentAfter = decasector.stateCommitmentByLine[refutationDescriptor.line];

    // transaction names start with 0 while state commitment count starts with 1, so -1 here
    const beforeStateIteration = stateCommitmentBefore.iteration - 1;
    const afterStateIteration = stateCommitmentAfter.iteration - 1;
    const stateCommitmentIndexBefore = stateCommitmentBefore.selection;
    const stateCommitmentIndexAfter = stateCommitmentAfter.selection;

    // TODO: what to do in this case?
    if (beforeStateIteration < 0) return Buffer.alloc(0);

    const stateTxBefore = getTemplateByName(templates, `${TemplateNames.STATE}_${twoDigits(beforeStateIteration)}`);
    const scBefore = getSpendingConditionByInput(templates, stateTxBefore.inputs[0]);
    const beforeRootKeys = scBefore.wotsPublicKeys![stateCommitmentIndexBefore];

    const stateTxAfter = getTemplateByName(templates, `${TemplateNames.STATE}_${twoDigits(afterStateIteration)}`);
    const scAfter = getSpendingConditionByInput(templates, stateTxAfter.inputs[0]);
    const afterRootKeys = scAfter.wotsPublicKeys![stateCommitmentIndexAfter];

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
    const merkleProofKeys: Buffer[][][] = [0, 1, 2].map((i) => merkleProofKeysAll.slice(i * 13, (i + 1) * 13));

    // now add the value before the proof, and the root after it
    {
        const sc = getSpendingConditionByInput(templates, argument.inputs[1]);
        merkleProofKeys[0].unshift(sc.wotsPublicKeys![0]); // a
        merkleProofKeys[1].unshift(sc.wotsPublicKeys![1]); // b
        merkleProofKeys[2].unshift(sc.wotsPublicKeys![2]); // c

        merkleProofKeys[0].push(beforeRootKeys);
        merkleProofKeys[1].push(beforeRootKeys);
        merkleProofKeys[2].push(afterRootKeys);
    }

    let scriptTemplate = scriptTampleCache['hash'];
    if (!scriptTemplate) {
        scriptTemplate = await createRefuteHashScriptTemplate();
        scriptTampleCache['hash'] = scriptTemplate;
    }

    // here's the script to refute one hash
    const refuteHash = async (leftKeys: Buffer[], rightKeys: Buffer[], resultKeys: Buffer[]): Promise<Buffer> => {
        return renderScriptTemplateWithKeys(scriptTemplate!, [leftKeys, rightKeys, resultKeys]);
    };

    const script = await refuteHash(
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHash],
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHash + 1],
        merkleProofKeys[refutationDescriptor.whichProof][refutationDescriptor.whichHash + 2]
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
