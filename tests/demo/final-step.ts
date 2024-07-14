import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { InstrCode, instrParamOptions } from '../../src/generator/step2/vm/types';
import { getEncodingIndexForPat, getEncodingIndexForVic, ProtocolRole, ProtocolStep } from './common';
import { StackItem } from '../../src/generator/step3/stack';
import { encodeLamportBit, getLamportPublicKey } from '../../src/encoding/lamport';
import { encodeWinternitz32, getWinternitzPublicKeys32 } from '../../src/encoding/winternitz';
import { bufferToBigints256BE } from '../../src/encoding/encoding';
import { internalPblicKey } from './public-key';
import { simpleTaproot } from '../../src/generator/taproot/taproot';
import { writeToFile } from './utils';

const step1_iterations = 19;
const step2_iterations = 5;

function iterationFromLineNumber(maxIterations: number, ln: number): number {
    let right = 2 ** maxIterations - 1;
    let left = 0;
    for (let i = 0; ; i++) {
        let middle = Math.round((right + left) / 2);
        if (middle == ln) return i;
        if (ln >= left && ln < middle) right = middle;
        else if (ln > middle && ln <= right) left = middle;
    }
}

function toBinary(n: number, bits: number): string {
    let s = n.toString(2);
    while (s.length < bits) s = '0' + s;
    return s;
}

function encodeLamportBitToWitness(bitcoin: Bitcoin, bit: number, step: ProtocolStep, iteration: number):
    { witness: StackItem, publicKey: bigint[] } {

    const index = getEncodingIndexForVic(step, iteration);
    const publicKey = [ getLamportPublicKey(index, 0), getLamportPublicKey(index, 1) ];
    const witness = bitcoin.addWitness(encodeLamportBit(index, bit));
    return { witness, publicKey };
}

function paramToWitness(bitcoin: Bitcoin, lineNumber: number, paramIndex: number, paramValue: bigint): 
    { witness: StackItem[], publicKey: bigint[] } {

    const chunkIndex = getEncodingIndexForPat(ProtocolStep.STEP2, iterationFromLineNumber(step2_iterations, lineNumber), paramIndex);
    const publicKey = getWinternitzPublicKeys32(chunkIndex);
    const encoded = bufferToBigints256BE(encodeWinternitz32(paramValue, chunkIndex));
    const witness = encoded.map(n => bitcoin.addWitness(n));
    return { publicKey, witness };
}

export function finalStep(step1_lineNumber: number, selection: number, step2_lineNumber: number,
    param1Index: number, param2Index: number, targetIndex: number,
    param1: bigint, param2: bigint, target: bigint,
    opcode: InstrCode) {

    const bitcoin = new Bitcoin();

    /*** search path ***/

    const step1_searchPath = toBinary(step1_lineNumber, 19).split('').map(s => Number(s));
    const transition_searchPath = toBinary(selection, 2).split('').map(s => Number(s));
    const step2_searchPath = toBinary(step2_lineNumber, 5).split('').map(s => Number(s));

    const searchPathKeys: bigint[][] = [];
    const searchPathWitness: StackItem[] = [];
    step1_searchPath.forEach((b, i) => {
        const { witness, publicKey } = encodeLamportBitToWitness(bitcoin, b, ProtocolStep.STEP1, i);
        searchPathKeys.push(publicKey);
        searchPathWitness.push(witness);
    });
    transition_searchPath.forEach((b, i) => {
        const { witness, publicKey } = encodeLamportBitToWitness(bitcoin, b, ProtocolStep.TRANSITION, i);
        searchPathKeys.push(publicKey);
        searchPathWitness.push(witness);
    });
    step2_searchPath.forEach((b, i) => {
        const { witness, publicKey } = encodeLamportBitToWitness(bitcoin, b, ProtocolStep.STEP2, i);
        searchPathKeys.push(publicKey);
        searchPathWitness.push(witness);
    });

    /*** params ***/

    let param1Nibbles, param2Nibbles, targetNibbles;

    const { witness: param1Witness, publicKey: param1PublicKey } = paramToWitness(bitcoin, step2_lineNumber, param1Index, param1 ?? 0n);
    const { witness: param2Witness, publicKey: param2PublicKey } = paramToWitness(bitcoin, step2_lineNumber, param2Index, param2 ?? 0n);
    const { witness: targetWitness, publicKey: targetPublicKey } = paramToWitness(bitcoin, step2_lineNumber, targetIndex, target ?? 0n);

    /*** program start ***/
    bitcoin.verifySearchPath(searchPathWitness, searchPathWitness.map(si => Number(si.value)), searchPathKeys);
    
    if (instrParamOptions[opcode][0]) {
        param1Nibbles = bitcoin.newNibbles32();
        bitcoin.winternitzDecode32(param1Nibbles, param1Witness, param1PublicKey);
    }
    if (instrParamOptions[opcode][1]) {
        param2Nibbles = bitcoin.newNibbles32();
        bitcoin.winternitzDecode32(param2Nibbles, param2Witness, param2PublicKey);
    }
    if (instrParamOptions[opcode][2]) {
        targetNibbles = bitcoin.newNibbles32();
        bitcoin.winternitzDecode32(targetNibbles, targetWitness, targetPublicKey);
    }

    switch (opcode) {
        // case InstrCode.ADD:
        //     bitcoin.step2_add(aReg, bReg, cReg);
        //     break;
        // case InstrCode.ADDOF:
        //     bitcoin.step2_addOf(aReg, bReg, cReg);
        //     break;
        // case InstrCode.SUB:
        //     bitcoin.step2_sub(aReg, bReg, cReg);
        //     break;
        // case InstrCode.SUBOF:
        //     bitcoin.step2_subOf(aReg, bReg, cReg);
        //     break;
        // case InstrCode.MOV:
        //     bitcoin.step2_mov(aReg, cReg);
        //     break;
        // case InstrCode.EQUAL:
        //     bitcoin.step2_equal(aReg, bReg, cReg);
        //     break;
        // case InstrCode.ANDBIT:
        //     bitcoin.step2_andBit(aReg, bReg, instr.bit ?? 0, cReg);
        //     break;
        // case InstrCode.ANDNOTBIT:
        //     bitcoin.step2_andNotBit(aReg, bReg, instr.bit ?? 0, cReg);
        //     break;
        // case InstrCode.SHR:
        //     bitcoin.step2_shr(aReg, instr.bit ?? 0, cReg);
        //     break;
        // case InstrCode.ROTR:
        //     bitcoin.step2_rotr(aReg, instr.bit ?? 0, cReg);
        //     break;
        // case InstrCode.AND:
        //     bitcoin.step2_and(aReg, bReg, cReg);
        //     break;
        // case InstrCode.XOR:
        //     bitcoin.step2_xor(aReg, bReg, cReg);
        //     break;
        // case InstrCode.OR:
        //     bitcoin.step2_or(aReg, bReg, cReg);
        //     break;
        // case InstrCode.NOT:
        //     bitcoin.step2_not(aReg, cReg);
        //     break;
        case InstrCode.ASSERTONE:
            bitcoin.step2_assertOne(param1Nibbles!);
            break;
        default:
            throw new Error('Not implemented');
    }

    // if (!bitcoin.success) throw new Error('Failed');

    writeToFile(bitcoin, ProtocolStep.FINAL, ProtocolRole.PAT);
}
