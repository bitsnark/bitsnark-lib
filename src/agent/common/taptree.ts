import { hasEvenY, lift_x, pointAdd, pointMul } from '../../common/point';
import { G, SECP256K1_ORDER, combineHashes, getHash, taprootVersion } from '../../common/taproot-common';
import { bigintFromBytes, bigintToBufferBE, bytesFromBigint, cat, padHex, taggedHash } from './encoding';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { array, last } from './common';
import assert from 'node:assert';

export const DEAD_ROOT = Buffer.from([0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a, 0x6a]);

bitcoin.initEccLib(ecc);

function toBinStringPad(n: number, l: number): string {
    let s = n.toString(2);
    while (s.length < l) s = '0' + s;
    return s;
}

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
        let temp = this.scripts.map((b) => getHash(b));
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
        let temp = this.scripts.map((b) => getHash(b));
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
        const keyBuf = Buffer.from(padHex(P.x.toString(16), 32), 'hex');
        return Buffer.concat([versionBuf, keyBuf, proof]);
    }

    public getScriptPubkey(): Buffer {
        const taproot = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(this.internalPubkey, 32),
            hash: this.getRoot(),
            network: bitcoin.networks.bitcoin
        });
        return taproot.output!;
    }
}

export class Compressor {
    private depth: number;
    private data: Buffer[][];
    private nextIndex: number = 0;
    private indexToSave: number;
    private indexesForProof: string[] = [];
    public script?: Buffer;
    public proof: Buffer[] = [];

    constructor(
        private internalPubkey: bigint,
        private leavesCount: number,
        indexToSave: number = -1
    ) {
        this.depth = Math.ceil(Math.log2(leavesCount)) + 1;
        this.data = array(this.depth, (_) => []);
        this.internalPubkey = internalPubkey;
        this.indexToSave = indexToSave;

        if (indexToSave >= 0) {
            const s = toBinStringPad(indexToSave, this.depth - 1);
            for (let i = 0; i < s.length; i++) {
                const ts = s.slice(0, i + 1).split('');
                ts[ts.length - 1] = ts[ts.length - 1] == '0' ? '1' : '0';
                this.indexesForProof[i] = ts.join('');
            }
        }
    }

    private sanity() {
        let n = 0;
        for (let i = 0; i < this.depth; i++) n = n * 2 + this.data[i].length;
        assert(this.nextIndex == n);
        assert(n <= 2 ** this.depth);
    }

    private indexStringForLevel(level: number): string {
        if (level >= this.depth) throw new Error('Level should be < depth');
        let n = 0;
        for (let i = 0; i <= level; i++) n = n * 2 + this.data[i].length;
        return toBinStringPad(n, level);
    }

    private compress() {
        for (let i = this.data.length - 1; i > 0; i--) {
            if (this.data[i].length == 2) {
                const hash = combineHashes(this.data[i][0], this.data[i][1]);
                const a = this.indexStringForLevel(i - 1);
                const b = this.indexesForProof[i - 2];
                if (a == b) this.proof[this.data.length - i] = hash;
                this.data[i] = [];
                this.data[i - 1].push(hash);
                this.sanity();
            }
        }
    }

    public addItem(script: Buffer) {
        if (this.nextIndex + 1 > 2 ** this.depth) throw new Error('Too many leaves');
        if (this.nextIndex === this.indexToSave) {
            this.script = script;
        }
        const hash = getHash(script);
        if ((this.nextIndex ^ 1) === this.indexToSave) this.proof![0] = hash;
        last(this.data).push(hash);
        this.nextIndex++;
        this.compress();
    }

    public getRoot(): Buffer {
        for (let i = this.data.length - 1; i > 0; i--) {
            if (this.data[i].length > 0) {
                const hash = combineHashes(this.data[i][0], this.data[i][1] ?? this.data[i][0]);
                const a = this.indexStringForLevel(i - 1);
                const b = this.indexesForProof[i - 2];
                if (a == b) this.proof[this.data.length - i] = hash;
                this.data[i] = [];
                this.data[i - 1].push(hash);
            }
        }
        return this.data[0][0];
    }

    public static toPubKey(internalPubkey: bigint, root: Buffer): Buffer {
        const taproot = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(internalPubkey, 32),
            hash: root,
            network: bitcoin.networks.bitcoin
        });
        return taproot.output!;
    }

    public getScriptPubkey(): Buffer {
        return Compressor.toPubKey(this.internalPubkey, this.getRoot());
    }

    public getControlBlock(): Buffer {
        const h = this.getRoot();
        const [parity, _] = taprootTweakPubkey(this.internalPubkey, h);
        const P = lift_x(this.internalPubkey);
        const versionBuf = Buffer.from([taprootVersion | Number(parity)]);
        const keyBuf = Buffer.from(padHex(P.x.toString(16), 32), 'hex');
        return Buffer.concat([versionBuf, keyBuf, ...this.proof]);
    }
}

function test1() {
    const index = 3;
    const scripts = array(8, (i) => Buffer.from([i]));
    const stt = new SimpleTapTree(1n, scripts);

    const c = new Compressor(1n, scripts.length, index);
    for (const s of scripts) c.addItem(s);

    const cRoot = c.getRoot();
    const sttRoot = stt.getRoot();
    assert(sttRoot.compare(cRoot) == 0);

    const sttKey = stt.getScriptPubkey();
    const cKey = c.getScriptPubkey();
    assert(sttKey.compare(cKey) == 0);

    const sttScript = stt.scripts[index];
    const cScript = c.script;
    assert(sttScript.compare(cScript!) == 0);

    const sttProof = stt.getProof(index);
    const cProof = Buffer.concat(c.proof);
    assert(sttProof.compare(cProof!) == 0);

    const sttControl = stt.getControlBlock(index);
    const cControl = c.getControlBlock();
    assert(sttControl.compare(cControl!) == 0);
}

function main() {
    test1();
}

if (require.main === module) {
    main();
}
