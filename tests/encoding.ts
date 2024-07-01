import { createHash, randomBytes } from "crypto";

export interface Key { prvt: bigint, pblc: bigint };

export function strToBigint(s: string): bigint {
    let n = 0n;
    for (let i = 0; i < s.length; i++) {
        n = n << 8n;
        n += BigInt(s.charCodeAt(i));
    }
    return n;
}

export function bufferToBigints256(buffer: Buffer): bigint[] {
    if (buffer.length % 32 != 0) throw new Error('invalid size');
    const output: bigint[] = [];
    for (let i = 0; i < buffer.length;) {
        let n = 0n;
        for (let j = 0; j < 32; j++) {
            n += BigInt(buffer[i++]) << (8n * BigInt(j));
        }
        output.push(n);
    }
    return output;
}

export function padHex(s: string, bytes: number): string {
    while (s.length < bytes * 2) s = '0' + s;
    return s;
}

export function hash(input: bigint, times: number = 1): bigint {
    let t = input;
    for (let i = 0; i < times; i++) {
        t = BigInt('0x' + createHash('sha256')
            .update(padHex(t.toString(16), 32), 'hex')
            .digest('hex'));
    }
    return t;
}

export function writeBigintToBuffer(target: Buffer, index: number, n: bigint, bytes: number) {
    for (let i = 0; i < bytes; i++) {
        target.writeUint8(Number(n & 0xffn), index + i);
        n = n >> 8n;
    }
}

export function bitsToBigint(bits: number[]): bigint {
    let n = 0n;
    for (let i = 0; i < bits.length; i++) {
        n += BigInt(bits[i]) << BigInt(i);
    }
    return n;
}

export function nibblesToBigint(nibbles: number[]): bigint {
    let n = 0n;
    for (let i = 0; i < nibbles.length; i++) {
        n += BigInt(nibbles[i]) << BigInt(i * 3);
    }
    return n;
}

const lamportSecret = 0x92654528273828827262552424442442442452829203874383876346n;
export const lamportKeys: Key[][] = [];
for (let i = 0; i < 256 * 32; i++) lamportKeys.push([
    { prvt: hash(lamportSecret + BigInt(i), 1), pblc: hash(lamportSecret + BigInt(i), 2) },
    { prvt: hash(lamportSecret + 1000000n + BigInt(i), 1), pblc: hash(lamportSecret + 1000000n + BigInt(i), 2) }
]);

function encodeLamportBit(target: Buffer, bitIndex: number, bit: number) {
    const t = bit == 0 ? lamportKeys[bitIndex][0].prvt : lamportKeys[bitIndex][1].prvt;
    const index = bitIndex * 32;
    writeBigintToBuffer(target, index, t, 32);
}

export function encodeLamportBits(input: bigint, bits: number): Buffer {
    const hashSizeBytes = 32;
    let output = Buffer.alloc(bits * hashSizeBytes);
    for (let i = 0; i < bits; i++) {
        encodeLamportBit(output, i, Number(input & 1n));
        input = input >> 1n;
    }
    return output;
}

const winternitzSecret = 0x92654528273736353535555533553553874383876346n;
export const winternitzKeys: Key[] = [];
for (let i = 0; i < 256 * 32; i++) winternitzKeys.push(
    { prvt: hash(winternitzSecret + BigInt(i)), pblc: hash(winternitzSecret + BigInt(i), 9) }
);

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

export function encodeWinternitz(input: bigint, chunkIndex: number, dataBits: number, checksumBits: number): Buffer {
    const W = 3;
    const checksumNibbles = Math.ceil(checksumBits / 3);
    const dataNibbles = Math.ceil(dataBits / W);
    const totalNibbles = checksumNibbles + dataNibbles;
    const hashSizeBytes = 32;
    const outputSizeBytes = (dataNibbles + checksumNibbles) * hashSizeBytes;
    let output = Buffer.alloc(outputSizeBytes);
    let checksum = 0;
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        writeBigintToBuffer(output, i * hashSizeBytes, hash(winternitzKeys[chunkIndex * totalNibbles + i].prvt, t), hashSizeBytes);
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        writeBigintToBuffer(output, (dataNibbles + i) * hashSizeBytes, hash(winternitzKeys[chunkIndex * totalNibbles + dataNibbles + i].prvt, nibble), hashSizeBytes);
    });
    return output;
}
