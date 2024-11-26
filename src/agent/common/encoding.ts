import { createHash } from 'crypto';

export interface Key {
    prvt: bigint;
    pblc: bigint;
}

export function strToBigint(s: string): bigint {
    let n = 0n;
    for (let i = 0; i < s.length; i++) {
        n = n << 8n;
        n += BigInt(s.charCodeAt(i));
    }
    return n;
}

export function bigintToBufferBE(n: bigint, bytes: number): Buffer {
    return Buffer.from(padHex(n.toString(16), bytes), 'hex');
}

export function bufferToBigints256BE(buffer: Buffer): bigint[] {
    if (buffer.length % 32 !== 0) throw new Error('invalid size');
    return bufferToBigintsBE(buffer, 32);
}

export function bufferToBigintsBE(buffer: Buffer, size: number): bigint[] {
    const output: bigint[] = [];
    for (let i = 0; i < buffer.length; ) {
        let n = 0n;
        for (let j = 0; j < size; j++) {
            n = (n << 8n) + BigInt(buffer[i++]);
        }
        output.push(n);
    }
    return output;
}

export function padHex(s: string, bytes: number): string {
    return s.padStart(bytes * 2, '0');
}

export function cat(buffers: Buffer[]): Buffer {
    return Buffer.concat(buffers);
}

export function hash(input: bigint, times: number = 1): bigint {
    let t = input;
    for (let i = 0; i < times; i++) {
        const s1 = padHex(t.toString(16), 32);
        const s2 = createHash('sha256').update(s1, 'hex').digest('hex');
        t = BigInt('0x' + s2);
    }
    return t;
}

export function hashPair(inputA: bigint, inputB: bigint): bigint {
    const s = padHex(inputA.toString(16), 32) + padHex(inputB.toString(16), 32);
    return BigInt('0x' + createHash('sha256').update(s, 'hex').digest('hex'));
}

export function taggedHash(tag: string, msg: Buffer): Buffer {
    const tagHash = createHash('sha256').update(tag, 'utf-8').digest();
    return createHash('sha256')
        .update(Buffer.concat([tagHash, tagHash, msg]))
        .digest();
}

export function bigintFromBytes(buf: Buffer): bigint {
    return BigInt('0x' + buf.toString('hex'));
}

export function bytesFromBigint(n: bigint): Buffer {
    let s = n.toString(16);
    if (s.length % 2) {
        // Buffer.from(n, 'hex') fails miserably if an odd-length string
        // (e.g. '2' or '101') is passed in
        s = '0' + s;
    }
    return Buffer.from(s, 'hex');
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
        n += BigInt(nibbles[i]) << (3n * BigInt(i));
    }
    return n;
}

export function _256To32LE(n: bigint): bigint[] {
    const r: bigint[] = [];
    for (let i = 0; i < 8; i++) {
        r.push(n & 0xffffffffn);
        n = n >> 32n;
    }
    return r;
}

export function _256To32BE(n: bigint): bigint[] {
    const r: bigint[] = [];
    const s = padHex(n.toString(16), 32);
    for (let i = 0; i < 8; i++) {
        r.push(BigInt('0x' + s.slice(i * 8, i * 8 + 8)));
    }
    return r;
}

export function _32To256LE(na: bigint[]): bigint {
    if (na.length !== 8) throw new Error('invalid size');

    let n = 0n;
    for (let i = 0; i < 8; i++) {
        n += na[i] << (32n * BigInt(i));
    }
    return n;
}

export function _32To256BE(na: bigint[]): bigint {
    if (na.length !== 8) throw new Error('invalid size');

    let n = 0n;
    for (let i = 0; i < 8; i++) {
        n = n << 32n;
        n += na[i];
    }
    return n;
}

export function bigintToString(n: bigint): string {
    return n.toString(16);
}

export function stringToBigint(s: string): bigint {
    return BigInt('0x' + s);
}

export function numToStr2Digits(i: number): string {
    return i < 10 ? `${i}` : `0${i}`;
}

export function bufferToBigint160(b: Buffer): bigint {
    if (b.length !== 20) throw new Error('Invalid size');
    return BigInt('0x' + b.toString('hex'));
}
