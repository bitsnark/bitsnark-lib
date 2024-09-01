import { createHash } from "crypto";
import { padHex } from "../encoding/encoding";

const taprootVersion = 0xc0;
const p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const SECP256K1_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];

type Point = bigint[] | null;

function bigintToBuffer(n: bigint): Uint8Array {
    return Buffer.from(padHex(n.toString(16), 32), 'hex');
}

function getHash(script: Buffer): Buffer {
    return taggedHash('TapLeaf',
        Buffer.concat([Buffer.from([taprootVersion]), compactSize(script.length), script]));
}

function combineHashes(left_h: Buffer, right_h: Buffer): Buffer {
    if (right_h.compare(left_h) == -1) {
        [left_h, right_h] = [right_h, left_h];
    }
    return taggedHash('TapBranch', Buffer.concat([left_h, right_h]));
}

function compactSize(l: number): Buffer {
    if (l <= 252) return Buffer.from([l]);
    if (l > 252 && l <= 65535) return Buffer.from([0xfd, l & 0xff, l >> 8]);
    if (l > 65535 && l <= 4294967295) return Buffer.from([0xfe, (l & 0xff), (l >> 8) & 0xff, (l >> 16) & 0xff, (l >> 24) & 0xff]);
    throw new Error('Too big');
}

function taggedHash(tag: string, msg: Buffer): Buffer {
    const tagHash = createHash('sha256').update(tag, 'utf-8').digest();
    return createHash('sha256').update(Buffer.concat([tagHash, tagHash, msg])).digest();
}

function bigintFromBytes(buf: Buffer): bigint {
    return BigInt('0x' + buf.toString('hex'));
}

function bytesFromBigint(n: bigint): Buffer {
    return Buffer.from(n.toString(16), 'hex');
}

function modPow(x: bigint, y: bigint, p: bigint): bigint {
    let result = 1n;
    x = x % p;
    while (y > 0) {
        if (y & 1n) result = (result * x) % p;
        y = y >> 1n;
        x = (x * x) % p;
    }
    return result;
}

function lift_x(x: bigint): bigint[] {
    if (x > p) throw new Error('x > p');
    const y_sq = (modPow(x, 3n, p) + 7n) % p;
    const y = modPow(y_sq, (p + 1n) / 4n, p);
    if (modPow(y, 2n, p) != y_sq) throw new Error('NaN');
    return [x, (y & 1n) == 0n ? y : p - y];
}

function x(P: Point): bigint {
    if (P == null) throw new Error('null');
    return P![0];
}

function y(P: Point): bigint {
    if (P == null) throw new Error('null');
    return P![1];
}

function hasEvenY(P: Point): boolean {
    if (P == null) throw new Error('null');
    return y(P) % 2n == 0n;
}

function pointAdd(P1: Point, P2: Point) {
    if (P1 == null) return P2;
    if (P2 == null) return P1;
    if (x(P1) == x(P2) && y(P1) != y(P2)) return null;
    let lam;
    if (x(P1) == x(P2) && y(P1) == y(P2))
        lam = (3n * x(P1) * x(P1) * modPow(2n * y(P1), p - 2n, p)) % p;
    else
        lam = ((y(P2) - y(P1)) * modPow(x(P2) - x(P1), p - 2n, p)) % p;
    const x3 = (lam * lam - x(P1) - x(P2)) % p;
    return [x3, (lam * (x(P1) - x3) - y(P1)) % p];
}

function pointMul(P: Point, n: bigint): Point {
    let R = null;
    for (let i = 0; i < 256; i++) {
        if ((n >> BigInt(i)) & 1n)
            R = pointAdd(R, P);
        P = pointAdd(P, P);
    }
    return R
}

function taprootTweakPubkey(pubkey: bigint, h: Buffer): any[] {
    const t = bigintFromBytes(taggedHash('TapTweak', Buffer.concat([bigintToBuffer(pubkey), h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    const P = lift_x(pubkey);
    const Q = pointAdd(P, pointMul(G, t));
    return [hasEvenY(Q) ? 0n : 1n, bytesFromBigint(x(Q))];
}

export class SimpleTapTree {

    internalPubkey: bigint;
    scripts: Buffer[];

    constructor(internalPubkey: bigint, scripts: Buffer[]) {
        this.internalPubkey = internalPubkey;
        this.scripts = scripts;
        const n = 2 ** Math.ceil(Math.log2(this.scripts.length));
        while (this.scripts.length < n) this.scripts.push(Buffer.from([]));
    }

    getRoot(): Buffer {
        let temp = this.scripts.map(b => getHash(b));
        while (temp.length > 1) {
            const other = [];
            while (temp.length > 0) {
                other.push(combineHashes(temp.shift()!, temp.shift()!));
            }
            temp = other;
        }
        return temp[0];
    }

    getProof(index: number): Buffer {
        const buffers: Buffer[] = [];
        let temp = this.scripts.map(b => getHash(b));
        while (temp.length > 1) {
            const other = [];
            const siblingIndex = index ^ 1;
            const sibling = temp[siblingIndex];
            buffers.push(sibling);
            while (temp.length > 0) {
                other.push(combineHashes(temp.shift()!, temp.shift()!));
            }
            temp = other;
            index = index >> 1;
        }
        return Buffer.concat(buffers);
    }

    public getControlBlock(index: number): Buffer {
        const versionBuf = Buffer.from([taprootVersion | 0x01]);
        const P = lift_x(this.internalPubkey);
        const keyBuf = Buffer.from(P![0].toString(16), 'hex');
        const proof = this.getProof(index);
        return Buffer.concat([versionBuf, keyBuf, proof]);    
    }

    public getAddress(): Buffer {
        const h = this.getRoot();
        const [_, output_pubkey] = taprootTweakPubkey(this.internalPubkey, h);
        return Buffer.concat([Buffer.from([0x51, 0x20]), output_pubkey]);
    }
}
