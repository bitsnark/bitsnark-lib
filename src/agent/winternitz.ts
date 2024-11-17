import { createHash } from 'node:crypto';
import { agentConf } from './agent.conf';
import assert from 'node:assert';
import { Bitcoin } from '../generator/btc_vm/bitcoin';

export const winternitzHashSizeInBytes = 20;

export enum WotsType {
    _256 = 'WOTS_256',
    _256_4 = 'WOTS_256_4',
    _24 = 'WOTS_24',
    _1 = 'WOTS_1'
}

export const WOTS_NIBBLES: any = {
    [WotsType._256]: 90,
    [WotsType._256_4]: 67,
    [WotsType._24]: 10,
    [WotsType._1]: 2
};

export const WOTS_BITS: any = {
    [WotsType._256]: 3,
    [WotsType._256_4]: 4,
    [WotsType._24]: 3,
    [WotsType._1]: 3
};

function hash(input: Buffer, times: number = 1): Buffer {
    let t = input;
    for (let i = 0; i < times; i++) {
        const h1 = createHash('sha256').update(t).digest();
        t = createHash('ripemd160').update(h1).digest();
    }
    return t;
}

function unhash(prehash: Buffer, publicKey: Buffer): number {
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
        [WotsType._1]: encodeWinternitz1
    };
    return encoders[type](input, unique);
}

export function decodeWinternitz(type: WotsType, input: Buffer[], keys: Buffer[]): bigint {
    const decoders = {
        [WotsType._256]: decodeWinternitz256,
        [WotsType._256_4]: decodeWinternitz256_4,
        [WotsType._24]: decodeWinternitz24,
        [WotsType._1]: decodeWinternitz1
    };
    return decoders[type](input, keys);
}

export function bufferToBigintBE(buffer: Buffer): bigint {
    return BigInt('0x' + buffer.toString('hex'));
}

export function bigintToBufferBE(n: bigint, bits: number): Buffer {
    let s = n.toString(16);
    while (s.length < Math.ceil(bits / 4)) s = '0' + s;
    return Buffer.from(s, 'hex');
}

function test_1() {
    const keys = getWinternitzPublicKeys(WotsType._1, '');
    const test1 = 1n;
    const encoded = encodeWinternitz1(test1, '');
    const decoded = decodeWinternitz1(encoded, keys);
    assert(test1 == decoded);

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));

        bitcoin.winternitzCheck1(witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        console.log('winternitz 1 check');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());
    }

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));
        const target = bitcoin.newStackItem(0);

        bitcoin.winternitzDecode1(target, witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        const btcDecoded = target.value;

        console.log('winternitz 1 decode');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());

        assert(test1 == BigInt(btcDecoded as number));
    }
}

function test_24() {
    const keys = getWinternitzPublicKeys(WotsType._24, '');
    const test1 = 234987n;
    const encoded = encodeWinternitz24(test1, '');
    const decoded = decodeWinternitz24(encoded, keys);
    assert(test1 == decoded);

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));

        bitcoin.winternitzCheck24(witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        console.log('winternitz 24 check');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());
    }

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));
        const target = witness.map((_) => bitcoin.newStackItem(0));

        bitcoin.winternitzDecode24(target, witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        const btcDecoded = fromNibbles(target.map((si) => Number(si.value)));

        console.log('winternitz 24 decode');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());

        assert(test1 == btcDecoded);
    }
}

function test_256() {
    const keys = getWinternitzPublicKeys(WotsType._256, '');
    const test1 = 13298712394871234987n;
    const encoded = encodeWinternitz256(test1, '');
    const decoded = decodeWinternitz256(encoded, keys);
    assert(test1 == decoded);

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));

        bitcoin.winternitzCheck256(witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        console.log('winternitz 256 check');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());
    }

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));
        const target = witness.map((_) => bitcoin.newStackItem(0));

        bitcoin.winternitzDecode256(target, witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        const btcDecoded = fromNibbles(target.map((si) => Number(si.value)));

        console.log('winternitz 256 decode');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());

        assert(test1 == btcDecoded);
    }
}

function test_256_4() {
    const keys = getWinternitzPublicKeys(WotsType._256_4, '');
    const test1 = 13298712394871234987n;
    const encoded = encodeWinternitz256_4(test1, '');
    const decoded = decodeWinternitz256_4(encoded, keys);
    assert(test1 == decoded);

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));

        bitcoin.winternitzCheck256_4(witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        console.log('winternitz 256_4 check');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());
    }

    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        const witness = encoded.map((b) => bitcoin.newStackItem(b));
        const target = witness.map((_) => bitcoin.newStackItem(0));

        bitcoin.winternitzDecode256_4(target, witness, keys);
        if (!bitcoin.success) throw new Error('Bitcoin script failed');

        const btcDecoded = fromNibbles_4(target.map((si) => Number(si.value)));

        console.log('winternitz 256_4 decode');
        console.log(
            'data: ',
            encoded.reduce<number>((p, c) => p + c.length, 0)
        );
        console.log('script: ', bitcoin.programSizeInBitcoinBytes());

        assert(test1 == btcDecoded);
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    test_1();
    test_24();
    test_256();
    test_256_4();
}
