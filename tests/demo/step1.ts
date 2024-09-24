import { Runner } from '../../src/generator/step1/vm/runner';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { bufferToBigints256BE } from '../../src/encoding/encoding';
import { decodeWinternitz256, encodeWinternitz256, getWinternitzPublicKeys256 } from '../../src/encoding/winternitz';
import { getEncodingIndexForPat, getEncodingIndexForVic, ProtocolRole, ProtocolStep } from './common';
import { decodeLamportBit, encodeLamportBit, getLamportPublicKeys } from '../../src/encoding/lamport';
import { SavedVm } from '../../src/generator/common/saved-vm';
import { InstrCode } from '../../src/generator/step1/vm/types';
import { simpleTaproot } from '../../src/generator/taproot/taproot';
import { internalPblicKey } from './public-key';
import { writeToFile } from './utils';

const maxLineCount = 2 ** 19 - 1;
const iterations = 19;

function getLineNumber(path: number[]): { left: number, middle: number, right: number } {
    let right = maxLineCount;
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

function patPart(saved: SavedVm<InstrCode>, searchPath: number[], iteration: number): bigint[] {

    const runner = Runner.load(saved);
    const line = getLineNumber(searchPath).middle;
    runner.execute(line);
    const merkleRoot = runner.getStateRoot();

    const bitcoin = new Bitcoin();
    const chunkIndex = getEncodingIndexForPat(ProtocolStep.STEP1, searchPath.length, 0);
    const witness = bufferToBigints256BE(encodeWinternitz256(merkleRoot, chunkIndex));
    bitcoin.winternitzCheck256(
        witness.map(n => bitcoin.addWitness(n)),
        getWinternitzPublicKeys256(chunkIndex));
        
    if (!bitcoin.success) throw new Error('Failed');

    writeToFile(bitcoin, ProtocolStep.STEP1, ProtocolRole.PAT, iteration);
    
    return witness;
}

function vicPart(saved: SavedVm<InstrCode>, searchPath: number[], encodedStateRoot: bigint[], iteration: number): bigint {

    const runner = Runner.load(saved);
    const middle = getLineNumber(searchPath).middle;
    runner.execute(middle);
    const midState = runner.getStateRoot();

    const patChunkIndex = getEncodingIndexForPat(ProtocolStep.STEP1, searchPath.length, 0);
    const patState = decodeWinternitz256(encodedStateRoot, patChunkIndex);

    const bitcoin = new Bitcoin();
    let direction: number;
    if (midState == patState) {
        direction = 1;
    } else direction = 0;

    const chunkIndex = getEncodingIndexForVic(ProtocolStep.STEP1, searchPath.length);
    const witness = encodeLamportBit(chunkIndex, direction);
    bitcoin.lamportDecodeBit(
        bitcoin.newStackItem(0n),
        bitcoin.addWitness(witness),
        getLamportPublicKeys(chunkIndex, 1)[0]);

    if (!bitcoin.success) throw new Error('Failed');

    writeToFile(bitcoin, ProtocolStep.STEP1, ProtocolRole.VIC, iteration);
    
    return witness;
}

export function step1(savedProgram: SavedVm<InstrCode>): number[] {

    const searchPath: number[] = [];

    for (let iteration = 0; iteration < iterations; iteration++) {

        console.log(' ***   ', getLineNumber(searchPath));

        const encodedStateRoot = patPart(savedProgram, searchPath, iteration);
        const encodedDirection = vicPart(savedProgram, searchPath, encodedStateRoot, iteration);
        const direction = decodeLamportBit(encodedDirection, getEncodingIndexForVic(ProtocolStep.STEP1, iteration));
        searchPath.push(direction);
    }

    const lineNumber = getLineNumber(searchPath).middle;
    console.log(' ***   ', lineNumber);
    console.log(' ***   ', searchPath);
    const runner = Runner.load(savedProgram);
    console.log(' ***   ', runner.getInstruction(lineNumber));
    return searchPath;
}
