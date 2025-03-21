import { createHash } from 'node:crypto';
import { agentConf } from '../agent.conf';
import { bigintToBufferBE } from './encoding';

export const winternitzHashSizeInBytes = 20;

export enum WotsType {
    _256 = 'WOTS_256',
    _256_4 = 'WOTS_256_4',
    _24 = 'WOTS_24',
    _1 = 'WOTS_1',
    _256_4_LP = '_256_4_LP'
}

export const WOTS_NIBBLES: { [key in WotsType]: number } = {
    [WotsType._256]: 90,
    [WotsType._256_4]: 67,
    [WotsType._24]: 10,
    [WotsType._1]: 2,
    [WotsType._256_4_LP]: 67
};

export const WOTS_DATA_NIBBLES: { [key in WotsType]: number } = {
    [WotsType._256]: 86,
    [WotsType._256_4]: 64,
    [WotsType._24]: 8,
    [WotsType._1]: 1,
    [WotsType._256_4_LP]: 64
};

export const WOTS_BITS: { [key in WotsType]: number } = {
    [WotsType._256]: 3,
    [WotsType._256_4]: 4,
    [WotsType._24]: 3,
    [WotsType._1]: 3,
    [WotsType._256_4_LP]: 4
};

export const WOTS_OUTPUT: { [key in WotsType]: number } = {
    [WotsType._256]: 90,
    [WotsType._256_4]: 67,
    [WotsType._24]: 10,
    [WotsType._1]: 2,
    [WotsType._256_4_LP]: 134
};

export const WOTS_TOTAL_BITS: { [key in WotsType]: number } = {
    [WotsType._256]: 256,
    [WotsType._256_4]: 256,
    [WotsType._24]: 24,
    [WotsType._1]: 1,
    [WotsType._256_4_LP]: 256
};

export function hash(input: Buffer, times: number = 1): Buffer {
    let t = input;
    for (let i = 0; i < times; i++) {
        const h1 = createHash('sha256').update(t).digest();
        t = createHash('ripemd160').update(h1).digest();
    }
    return t;
}

export function unhash(prehash: Buffer, publicKey: Buffer): number {
    for (let i = 0; i < 256; i++) {
        prehash = hash(prehash);
        if (prehash.equals(publicKey)) return i;
    }
    throw new Error('Invalid prehash or key');
}

function getWinternitzPrivateKey(unique: string): Buffer {
    return createHash('ripemd160').update(agentConf.winternitzSecret, 'ascii').update(unique).digest();
}

function getWinternitzPublicKey(unique: string, bitsPerNibble: number): Buffer {
    return hash(getWinternitzPrivateKey(unique), 2 ** bitsPerNibble);
}

export function getWinternitzPrivateKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPrivateKey(unique + '/' + i));
    }
    return t;
}

export function getWinternitzPublicKeys(wotsType: WotsType, unique: string): Buffer[] {
    const t: Buffer[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(getWinternitzPublicKey(unique + '/' + i, WOTS_BITS[wotsType]));
    }
    return t;
}

export function getWinternitzPublicKeysDebug(wotsType: WotsType, unique: string): string[] {
    const t: string[] = [];
    for (let i = 0; i < WOTS_NIBBLES[wotsType]; i++) {
        t.push(unique + '/' + i);
    }
    return t;
}

export function toNibbles(input: bigint, count: number): number[] {
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
        nibbles.push(Number(input & 7n));
        input = input >> 3n;
    }
    return nibbles;
}

export function toNibbles_4(input: bigint, count: number): number[] {
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
        nibbles.push(Number(input & 15n));
        input = input >> 4n;
    }
    return nibbles;
}

export function fromNibbles(nibbles: number[]): bigint {
    let n = 0n;
    for (let i = 0; i < nibbles.length; i++) {
        n += BigInt(nibbles[i]) << BigInt(i * 3);
    }
    return n;
}

export function fromNibbles_4(nibbles: number[]): bigint {
    let n = 0n;
    for (let i = 0; i < nibbles.length; i++) {
        n += BigInt(nibbles[i]) << BigInt(i * 4);
    }
    return n;
}

export function encodeWinternitz1(input: bigint, unique: string): Buffer[] {
    const output: Buffer[] = [];
    let checksum = 0;
    const dataNibbles = toNibbles(input, 1);
    checksum += dataNibbles[0];
    const t = 7 - dataNibbles[0];
    output.push(hash(getWinternitzPrivateKey(unique + '/' + 0), t));
    const checksumNibbles = toNibbles(BigInt(checksum), 1);
    output.push(hash(getWinternitzPrivateKey(unique + '/' + 1), checksumNibbles[0]));
    return output;
}

export function decodeWinternitz1(input: Buffer[], publicKeys: Buffer[]): bigint {
    let n = 0n;
    let checksum = 0;
    let nibble = unhash(input[0], publicKeys[0]);
    checksum += nibble;
    n += BigInt(nibble);
    nibble = 7 - unhash(input[1], publicKeys[1]);
    checksum -= nibble;
    if (checksum != 0) throw new Error('Invalid checksum');
    return n;
}

export function encodeWinternitz24(input: bigint, unique: string): Buffer[] {
    const output: Buffer[] = [];
    let checksum = 0;
    const dataNibbles = toNibbles(input, 8);
    dataNibbles.forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + '/' + i), t));
    });
    const checksumNibbles = toNibbles(BigInt(checksum), 2);
    checksumNibbles.forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + '/' + (8 + i)), nibble));
    });
    return output;
}

export function decodeWinternitz24(input: Buffer[], publicKeys: Buffer[]): bigint {
    let n = 0n;
    let checksum = 0;
    for (let i = 0; i < 8; i++) {
        const nibble = unhash(input[i], publicKeys[i]);
        checksum += nibble;
        n += BigInt(nibble << (i * 3));
    }
    const checksumNibbles = toNibbles(BigInt(checksum), 2);
    for (let i = 0; i < 2; i++) {
        const nibble = 7 - unhash(input[8 + i], publicKeys[8 + i]);
        if (checksumNibbles[i] != nibble) throw new Error('Invalid checksum');
    }
    return n;
}

export function encodeWinternitz256(input: bigint, unique: string): Buffer[] {
    const output: Buffer[] = [];
    let checksum = 0;
    const nibbles = toNibbles(input, 86);
    nibbles.forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + '/' + i), t));
    });
    const checksumNibbles = toNibbles(BigInt(checksum), 4);
    checksumNibbles.forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + '/' + (86 + i)), nibble));
    });
    return output;
}

export function decodeWinternitz256(input: Buffer[], publicKeys: Buffer[]): bigint {
    let n = 0n;
    let checksum = 0;
    for (let i = 0; i < 86; i++) {
        const nibble = unhash(input[i], publicKeys[i]);
        checksum += nibble;
        n += BigInt(nibble) << BigInt(i * 3);
    }
    const checksumNibbles = toNibbles(BigInt(checksum), 4);
    for (let i = 0; i < 4; i++) {
        const nibble = 7 - unhash(input[86 + i], publicKeys[86 + i]);
        if (checksumNibbles[i] != nibble) throw new Error('Invalid checksum');
    }
    return n;
}

export function encodeWinternitz256_4(input: bigint, unique: string): Buffer[] {
    const output: Buffer[] = [];
    let checksum = 0;
    const nibbles = toNibbles_4(input, 64);
    nibbles.forEach((nibble, i) => {
        checksum += nibble;
        const t = 15 - nibble;
        output.push(hash(getWinternitzPrivateKey(unique + '/' + i), t));
    });
    const checksumNibbles = toNibbles_4(BigInt(checksum), 3);
    checksumNibbles.forEach((nibble, i) => {
        output.push(hash(getWinternitzPrivateKey(unique + '/' + (64 + i)), nibble));
    });
    return output;
}

export function decodeWinternitz256_4(input: Buffer[], publicKeys: Buffer[]): bigint {
    let n = 0n;
    let checksum = 0;
    for (let i = 0; i < 64; i++) {
        const nibble = unhash(input[i], publicKeys[i]);
        checksum += nibble;
        n += BigInt(nibble) << BigInt(i * 4);
    }
    const checksumNibbles = toNibbles_4(BigInt(checksum), 3);
    for (let i = 0; i < 3; i++) {
        const nibble = 15 - unhash(input[64 + i], publicKeys[64 + i]);
        if (checksumNibbles[i] != nibble) throw new Error('Invalid checksum');
    }
    return n;
}

export function encodeWinternitz(type: WotsType, input: bigint, unique: string): Buffer[] {
    const encoders = {
        [WotsType._256]: encodeWinternitz256,
        [WotsType._256_4]: encodeWinternitz256_4,
        [WotsType._24]: encodeWinternitz24,
        [WotsType._1]: encodeWinternitz1,
        [WotsType._256_4_LP]: encodeWinternitz256_4_lp
    };
    return encoders[type](input, unique);
}

export function decodeWinternitz(type: WotsType, input: Buffer[], keys: Buffer[]): bigint {
    const decoders = {
        [WotsType._256]: decodeWinternitz256,
        [WotsType._256_4]: decodeWinternitz256_4,
        [WotsType._24]: decodeWinternitz24,
        [WotsType._1]: decodeWinternitz1,
        [WotsType._256_4_LP]: decodeWinternitz256_4_lp
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return decoders[type](input as any, keys);
}

export function encodeWinternitz256_4_lp(input: bigint, unique: string): Buffer[] {
    const output: Buffer[] = [];
    let checksum = 0;
    const nibbles = toNibbles_4(input, 64);
    for (let i = 0; i < nibbles.length; i++) {
        const nibble = nibbles[i];
        checksum += nibble;
        output.push(Buffer.from([nibble]));
        output.push(hash(getWinternitzPrivateKey(unique + '/' + i), nibble));
    }
    const checksumNibbles = toNibbles_4(BigInt(checksum), 3);
    for (let i = 0; i < checksumNibbles.length; i++) {
        const nibble = checksumNibbles[i];
        output.push(Buffer.from([15 - nibble]));
        output.push(hash(getWinternitzPrivateKey(unique + '/' + (64 + i)), 15 - nibble));
    }
    return output;
}

function lpNibble(a: Buffer | number): number {
    let trueNibble: number | Buffer = 0;
    if (typeof a == 'number') trueNibble = a;
    else if (a instanceof Buffer && (a as Buffer).length == 0) trueNibble = 0;
    else if (a instanceof Buffer && (a as Buffer).length == 1) trueNibble = (a as Buffer)[0];
    else {
        throw new Error('Invalid nibble');
    }
    return trueNibble;
}

export function decodeWinternitz256_4_lp(input: Buffer[], publicKeys: Buffer[]): bigint {
    let n = 0n;
    let checksum = 0;
    for (let i = 0; i < 64; i++) {
        const trueNibble = lpNibble(input[i * 2]);
        const nibble = 15 - unhash(input[i * 2 + 1] as Buffer, publicKeys[i]);
        if (trueNibble != nibble) throw new Error('Invalid hash');
        checksum += nibble;
        n += BigInt(nibble) << BigInt(i * 4);
    }
    const checksumNibbles = toNibbles_4(BigInt(checksum), 3);
    for (let i = 0; i < 3; i++) {
        const trueNibble = 15 - lpNibble(input[(64 + i) * 2]);
        const nibble = unhash(input[(64 + i) * 2 + 1] as Buffer, publicKeys[64 + i]);
        if (trueNibble != nibble || checksumNibbles[i] != nibble) throw new Error('Invalid checksum');
    }
    return n;
}

export function decodeWinternitzToBigint(type: WotsType, input: Buffer[], publicKeys: Buffer[]): bigint {
    if (input.length != WOTS_OUTPUT[type]) throw new Error('Invalid size');
    if (publicKeys.length != WOTS_NIBBLES[type]) throw new Error('Invalid size');
    const decoders = {
        [WotsType._256]: decodeWinternitz256,
        [WotsType._256_4]: decodeWinternitz256_4,
        [WotsType._24]: decodeWinternitz24,
        [WotsType._1]: decodeWinternitz1,
        [WotsType._256_4_LP]: decodeWinternitz256_4_lp
    };
    return decoders[type](input, publicKeys);
}

export function decodeWinternitzToBuffer(type: WotsType, input: Buffer[], publicKeys: Buffer[]): Buffer {
    return bigintToBufferBE(decodeWinternitzToBigint(type, input, publicKeys), WOTS_TOTAL_BITS[type]);
}
