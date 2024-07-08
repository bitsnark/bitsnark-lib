import { Runner } from '../../src/generator/step2/vm/runner';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { bufferToBigints256 } from '../../src/encoding/encoding';
import { decodeWinternitz32, encodeWinternitz32, getWinternitzPublicKeys32 } from '../../src/encoding/winternitz';
import { getEncodingIndexForPat, getEncodingIndexForVic, ProtocolStep } from './common';
import { decodeLamportBit, encodeLamportBit, getLamportPublicKeys } from '../../src/encoding/lamport';
import { SavedVm } from '../../src/generator/common/saved-vm';
import { InstrCode } from '../../src/generator/step2/vm/types';

function compare(a: bigint[], b: bigint[]): boolean {
    if (!(a && b) || a.length != b.length) return false;
    return a.every((v, i) => v == b[i]);
}

function getLineNumber(path: number[], maxIterations: number): { left: number, middle: number, right: number } {
    let right = 2 ** maxIterations - 1;
    let left = 0;
    let middle;
    if (right - left <= 1) middle = right;
    else middle = Math.floor((right + left) / 2);
    for (let i = 0; i < path.length; i++) {
        if (path[i] == 0) {
            right = middle;
        } else { 
            left = middle;
        }
        if (right - left <= 1) middle = right;
        else middle = Math.floor((right + left) / 2);
    }
    return { left, middle, right };
}

function patPart(saved: SavedVm<InstrCode>, searchPath: number[], maxIterations: number): bigint[] {

    const runner = Runner.load(saved);
    const line = getLineNumber(searchPath, maxIterations).middle;
    runner.execute(line);
    let state = runner.getRegisterValuesNoHardcoded();

    const bitcoin = new Bitcoin();
    const witness: bigint[] = [];
    const publicKeys: bigint[] = [];
    state.forEach((n, i) => {
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.STEP2, searchPath.length, i);
        witness.push(...bufferToBigints256(encodeWinternitz32(n, chunkIndex)));
        publicKeys.push(...getWinternitzPublicKeys32(chunkIndex));
    });
    bitcoin.checkStep2State(
        witness.map(n => bitcoin.addWitness(n)),
        publicKeys);
    if (!bitcoin.success) throw new Error('Failed');

    console.log('********************************************************************************')
    console.log(`Step 2 iteration ${searchPath.length + 1} (PAT):`);
    console.log('data size: ', witness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    // console.log('witness: ', witness);
    // console.log('program: ', bitcoin.programToString());

    return witness;
}

function vicPart(saved: SavedVm<InstrCode>, searchPath: number[], encodedState: bigint[], maxIterations: number): bigint {

    const runner = Runner.load(saved);
    const middle = getLineNumber(searchPath, maxIterations).middle;
    runner.execute(middle);
    const midState = runner.getRegisterValuesNoHardcoded();

    const patState: bigint[] = [];
    for (let i = 0; i < encodedState.length / 14; i++) {
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.STEP2, searchPath.length, i);
        patState.push(decodeWinternitz32(encodedState.slice(i * 14, i * 14 + 14), chunkIndex));
    }

    const bitcoin = new Bitcoin();
    let direction: number;
    if (compare(midState, patState)) {
        direction = 1;
    } else direction = 0;

    const chunkIndex = getEncodingIndexForVic(ProtocolStep.STEP1, searchPath.length);
    const witness = encodeLamportBit(chunkIndex, direction);
    bitcoin.lamportDecodeBit(
        bitcoin.newStackItem(0n),
        bitcoin.addWitness(witness),
        getLamportPublicKeys(chunkIndex, 1)[0]);
    if (!bitcoin.success) throw new Error('Failed');

    console.log('********************************************************************************')
    console.log(`Step 2 iteration ${searchPath.length + 1} (VIC):`);
    console.log('data size: ', 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    // console.log('witness: ', witness);
    //console.log('program: ', bitcoin.programToString());
    
    return witness;
}

export function step2(savedProgram: SavedVm<InstrCode>): number[] {

    const iterations = Math.ceil(Math.log2(savedProgram.program.length));
    const searchPath: number[] = [];

    for (let iteration = 0; iteration < iterations; iteration++) {

        console.log(' ***   ', getLineNumber(searchPath, iterations));

        const encodedState = patPart(savedProgram, searchPath, iterations);
        const encodedDirection = vicPart(savedProgram, searchPath, encodedState, iterations);
        const direction = decodeLamportBit(encodedDirection, getEncodingIndexForVic(ProtocolStep.STEP1, iteration));
        searchPath.push(direction);
    }

    const lineNumber = getLineNumber(searchPath, iterations).middle;
    console.log(' ***   ', lineNumber);
    console.log(' ***   ', searchPath);
    const runner = Runner.load(savedProgram);
    console.log(' ***   ', runner.getInstruction(lineNumber));
    return searchPath;
}
