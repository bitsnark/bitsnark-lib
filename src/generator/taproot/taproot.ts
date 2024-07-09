import { createHash } from "crypto";

const p = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const SECP256K1_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
const G = [
    0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
    0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n];

type Point = bigint[] | null;

export abstract class Node {

    path: number[];

    constructor(_path: number[]) {
        this.path = _path;
    }

    abstract fromPath(path: number[]): Node;
    abstract isLeaf(): boolean;
    abstract getScript(): Buffer;

    getPathLeft(): number[] {
        return [...this.path, 0];
    }

    getPathRight(): number[] {
        return [...this.path, 1];
    }

    getHash(): Buffer {
        if (this.isLeaf()) {
            return taggedHash('TapLeaf', Buffer.concat([Buffer.from([0xc0]), this.getScript()]));
        } else {
            const n = this.fromPath(this.path);
            let left_h = this.fromPath(this.getPathLeft()).getHash();
            let right_h = this.fromPath(this.getPathRight()).getHash();
            if (right_h.compare(left_h) == -1) {
                [left_h, right_h] = [right_h, left_h];
            }
            return Buffer.concat([left_h, right_h]);
        }
    }
}

function taggedHash(tag: string, msg: Buffer): Buffer {
    const tagHash = createHash('sha256').update(tag, 'ascii').digest();
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

function taprootTweakPubkey(pubkey: Buffer, h: Buffer): any[] {
    const t = bigintFromBytes(taggedHash('TapTweak', Buffer.concat([pubkey, h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    const P = lift_x(bigintFromBytes(pubkey));
    const Q = pointAdd(P, pointMul(G, t));
    return [hasEvenY(Q) ? 0n : 1n, bytesFromBigint(x(Q))];
}

function taprootTweakSecretKey(_seckey0: Buffer, h: Buffer) {
    const seckey0 = bigintFromBytes(_seckey0);
    const P = pointMul(G, seckey0);
    const seckey = hasEvenY(P) ? seckey0 : SECP256K1_ORDER - seckey0;
    const t = bigintFromBytes(taggedHash('TapTweak', Buffer.concat([bytesFromBigint(x(P)), h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    return bytesFromBigint((seckey + t) % SECP256K1_ORDER);
}

// Given an internal public key and a tree of scripts, compute the output script.
export function taprootOutputScript(internalPubkey: Buffer, scriptTree: Node): Buffer {
    const h = scriptTree.getHash();
    const [_, output_pubkey] = taprootTweakPubkey(internalPubkey, h);
    return Buffer.concat([Buffer.from([0x51, 0x20]), output_pubkey]);
}

