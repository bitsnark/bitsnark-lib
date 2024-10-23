import { hasEvenY, lift_x, pointAdd, pointMul } from "../common/point";
import {
    G,
    SECP256K1_ORDER,
    combineHashes,
    getHash,
    taprootVersion,
} from "../common/taproot-common";
import {
    bigintFromBytes,
    bigintToBufferBE,
    bytesFromBigint,
    cat,
    padHex,
    taggedHash,
} from "../encoding/encoding";

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

const DEAD_ROOT = Buffer.from('UNSPENDABLE', 'ascii');

bitcoin.initEccLib(ecc);

function taprootTweakPubkey(pubkey: bigint, h: Buffer): any[] {
    const t = bigintFromBytes(taggedHash('TapTweak', cat([bigintToBufferBE(pubkey, 32), h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    const P = lift_x(pubkey);
    const Q = pointAdd(P, pointMul(G, t));

    return [hasEvenY(Q) ? 0n : 1n, bytesFromBigint(Q?.x ?? 0n) ?? null];
}

export class SimpleTapTree {

    internalPubkey: bigint;
    scripts: Buffer[];

    constructor(internalPubkey: bigint, scripts: Buffer[]) {
        this.internalPubkey = internalPubkey;
        this.scripts = scripts;
    }

    getRoot(): Buffer {
        if (this.scripts.length == 0) return DEAD_ROOT;
        let temp = this.scripts.map(b => getHash(b));
        while (temp.length > 1) {
            const other: Buffer[] = [];
            while (temp.length > 0) {
                const left = temp.shift()!;
                const right = temp.shift() ?? left;
                other.push(combineHashes(left, right));
            }
            temp = other;
        }
        return temp[0];
    }

    getProof(index: number): Buffer {
        const buffers: Buffer[] = [];
        let temp = this.scripts.map(b => getHash(b));
        while (temp.length > 1) {
            const other: Buffer[] = [];
            const siblingIndex = index ^ 1;
            const sibling = temp[siblingIndex] ?? temp[index];
            buffers.push(sibling);
            while (temp.length > 0) {
                const left = temp.shift()!;
                const right = temp.shift() ?? left;
                other.push(combineHashes(left, right));
            }
            temp = other;
            index = index >> 1;
        }
        return cat(buffers);
    }

    public getControlBlock(index: number): Buffer {
        const proof = this.getProof(index);
        const h = this.getRoot();
        const [parity, _] = taprootTweakPubkey(this.internalPubkey, h);
        const P = lift_x(this.internalPubkey);
        const versionBuf = Buffer.from([taprootVersion | Number(parity)]);
        const keyBuf = Buffer.from(padHex(P.x.toString(16), 32), "hex");
        return Buffer.concat([versionBuf, keyBuf, proof]);
    }

    public getScriptPubkey(): Buffer {
        const taproot = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(this.internalPubkey, 32),
            hash:  this.getRoot(),
            network: bitcoin.networks.bitcoin
        });
        return taproot.output!;
    }
}

export class Compressor {

    data: Buffer[][];
    counter: number = 0;

    constructor(private depth: number, private internalPubkey: bigint) {
        this.data = new Array(depth).fill(null).map(() => []);
        this.internalPubkey = internalPubkey;
    }

    addItem(script: Buffer) {
        this.compress();
        this.data[this.data.length - 1].push(getHash(script));
        this.counter++;
    }

    compress() {
        for (let i = this.data.length - 1; i > 0; i--) {
            if (this.data[i].length == 2) {
                const hash = combineHashes(this.data[i][0], this.data[i][1]);
                this.data[i] = [];
                this.data[i - 1].push(hash);
            }
        }
    }

    getRoot(): Buffer {
        while (this.counter < 2 ** this.depth) this.addItem(Buffer.alloc(0));
        this.compress();
        return this.data[0][0];
    }

    public getScriptPubkey(): Buffer {
        const taproot = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(this.internalPubkey, 32),
            hash:  this.getRoot(),
            network: bitcoin.networks.bitcoin
        });
        return taproot.output!;
    }
}
