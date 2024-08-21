import { bufferToBigints256BE, padHex } from "../encoding/encoding";
import { decodeWinternitz256, encodeWinternitz256, getWinternitzPublicKeys256 } from "../encoding/winternitz";

export enum ProtocolStep {
    INITIAL = 'INITIAL',
    CHALLENGE = 'CHALLENGE',
    STEP1 = 'STEP1',
    TRANSITION = 'TRANSITION',
    STEP2 = 'STEP2',
    FINAL = 'FINAL'
};

const stepToNum = {
    [ProtocolStep.INITIAL]: 0,
    [ProtocolStep.CHALLENGE]: 1,
    [ProtocolStep.STEP1]: 2,
    [ProtocolStep.TRANSITION]: 3,
    [ProtocolStep.STEP2]: 4,
    [ProtocolStep.FINAL]: 5,
};

const numToStep = [
    ProtocolStep.INITIAL,
    ProtocolStep.CHALLENGE,
    ProtocolStep.STEP1,
    ProtocolStep.TRANSITION,
    ProtocolStep.STEP2,
    ProtocolStep.FINAL,
];

export enum ProtocolRole {
    PAT = 'PAT',
    VIC = 'VIC'
}


export interface TransactionInfo {
    taprootAddress: Buffer,
    scripts: Buffer[],
    controlBlocks: Buffer[],
    wotsPublicKeys: bigint[] | bigint[][]
}

export interface ScriptAndKeys {
    script: Buffer,
    publicKeys: bigint[] | bigint[][]
}

export function bigintToString(n: bigint): string {
    return n.toString(16);
}

export function stringToBigint(s: string): bigint {
    return BigInt('0x' + s);
}

export function getEncodingIndexForPat(step: ProtocolStep, iteration: number, registerIndex: number): number {
    return stepToNum[step] * 1000000 + iteration * 256 * 256 + registerIndex * 256;
}

export function getEncodingIndexForVic(step: ProtocolStep, iteration: number): number {
    return stepToNum[step] * 32 + iteration;
}

export function reverseEncodingIndexForVic(n: number): { step: ProtocolStep, iteration: number } {
    return { step: numToStep[Math.floor(n / 32)], iteration: n % 32 };
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