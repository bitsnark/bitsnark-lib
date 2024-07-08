import fs from 'fs';
import groth16Verify, { Key, Proof } from "../../src/generator/step1/verifier";
import { step1_vm } from "../../src/generator/step1/vm/vm";
import { proof, publicSignals } from "./proof";
import { SavedVm } from '../../src/generator/common/saved-vm';
import { InstrCode } from '../../src/generator/step1/vm/types';
import { bufferToBigints256BE } from '../../src/encoding/encoding';
import { decodeWinternitz256, encodeWinternitz256, getWinternitzPublicKeys256 } from '../../src/encoding/winternitz';

export enum ProtocolStep {
    INITIAL,
    CHALLENGE,
    STEP1,
    TRANSITION,
    STEP2,
    FINAL
};

export function getEncodingIndexForPat(step: ProtocolStep, iteration: number, registerIndex: number): number {
    return Number(step) * 1000000 + iteration * 256 * 256 + registerIndex * 256;
}

export function getEncodingIndexForVic(step: ProtocolStep, iteration: number): number {
    return Number(step) * 32 + iteration;
}

export function transitionPatEncode(param1: bigint, param2: bigint, target: bigint): { witness: bigint[], publicKeys: bigint[] } {
    const witness: bigint[] = [];
    const publicKeys: bigint[] = [];
    [param1, param2, target].forEach((n, i) => {
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.TRANSITION, 0, i);
        const twitness = bufferToBigints256BE(encodeWinternitz256(n, chunkIndex));
        witness.push(...twitness);
        publicKeys.push(...getWinternitzPublicKeys256(chunkIndex));
    });
    return { witness, publicKeys };
}

export function transitionPatDecode(witness: bigint[]): bigint[] {
    function decodeParam(index: number): bigint{
        const twitness = witness.slice(index * 90, index * 90 + 90);
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.TRANSITION, 0, index);
        return decodeWinternitz256(twitness, chunkIndex)
    }

    return [
        decodeParam(0), decodeParam(1), decodeParam(2)
    ];
}

export function initialPatDecode(encodedProof: bigint[]): bigint[] {
    const proof: bigint[] = [];
    for (let i = 0; i < encodedProof.length / 90; i++) {
        const chunk = encodedProof.slice(i * 90, i * 90 + 90);
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.INITIAL, 0, i);
        proof[i] = decodeWinternitz256(chunk, chunkIndex);
    }
    return proof;
}