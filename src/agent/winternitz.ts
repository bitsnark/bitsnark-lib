import { createHash } from "node:crypto";
import { agentConf } from "../../agent.conf";

export enum WotsType {
    _256 = 'WOTS_256',
    _24 = 'WOTS_24',
    _1 = 'WOTS_1'
}

export const WOTS_NIBBLES: any = {
    [WotsType._256]: 90,
    [WotsType._24]: 10,
    [WotsType._1]: 2
};

function hash(input: Buffer, times: number = 1): Buffer {
    let t = input;
    for (let i = 0; i < times; i++) {
        t = createHash('ripemd160').update(t).digest();
    }
    return t;
}

function getWinternitzPrivateKey(unique: string): Buffer {
    return createHash('ripemd160')
        .update(agentConf.winternitzSecret, 'ascii')
        .update(unique)
        .digest();
}

function getWinternitzPublicKey(unique: string, bitsPerNibble: number): Buffer {
    return hash(getWinternitzPrivateKey(unique), 2 ** bitsPerNibble);
}

export function getWinternitzPrivateKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPrivateKey(unique + i));
    }
    return t;
}

export function getWinternitzPublicKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPublicKey(unique + i, 3));
    }
    return t;
}

function toNibbles(input: bigint, count: number): number[] {
    const W = 3;
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
        let nibble = 0;
        for (let j = 0; j < W; j++) {
            nibble += Number(input & 1n) << j;
            input = input >> 1n;
        }
        nibbles.push(nibble);
    }
    return nibbles;
}

export function encodeWinternitz1(input: bigint, unique: string): Buffer[] {
    const checksumNibbles = 1;
    const dataNibbles = 1;
    const output: Buffer[] = [];
    let checksum = 0;
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + i), t));
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + (dataNibbles + i)), nibble));
    });
    return output;
}

export function encodeWinternitz24(input: bigint, unique: string): Buffer[] {
    const checksumNibbles = 2;
    const dataNibbles = 8;
    const output: Buffer[] = [];
    let checksum = 0;
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + i), t));
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + (dataNibbles + i)), nibble));
    });
    return output;
}


export function encodeWinternitz256(input: bigint, unique: string): Buffer[] {
    const checksumNibbles = 4;
    const dataNibbles = 86;
    const output: Buffer[] = [];
    let checksum = 0;
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + i), t));
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + (dataNibbles + i)), nibble));
    });
    return output;
}
