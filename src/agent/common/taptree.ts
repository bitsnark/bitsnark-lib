import { hasEvenY, lift_x, pointAdd, pointMul } from '../../common/point';
import {
    G,
    SECP256K1_ORDER,
    combineHashes as combineHashesCommon,
    getHash,
    taprootVersion
} from '../../common/taproot-common';
import { bigintFromBytes, bigintToBufferBE, bytesFromBigint, cat, padHex, taggedHash } from './encoding';

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { array, last, range } from './array-utils';
import { agentConf } from '../agent.conf';
import { DEAD_ROOT } from './constants';

bitcoin.initEccLib(ecc);

const DEAD_ROOT_PAIR = combineHashesCommon(DEAD_ROOT, DEAD_ROOT);

function combineHashes(a: Buffer, b: Buffer): Buffer {
    if (a.compare(b) == 0 && a.compare(DEAD_ROOT) == 0) return DEAD_ROOT_PAIR;
    return combineHashesCommon(a, b);
}

function toBinStringPad(n: number, l: number): string {
    let s = n.toString(2);
    while (s.length < l) s = '0' + s;
    return s;
}

function taprootTweakPubkey(pubkey: bigint, h: Buffer): [bigint, Buffer | null] {
    const t = bigintFromBytes(taggedHash('TapTweak', cat([bigintToBufferBE(pubkey, 256), h])));
    if (t >= SECP256K1_ORDER) throw new Error('t >= SECP256K1_ORDER');
    const P = lift_x(pubkey);
    const Q = pointAdd(P, pointMul(G, t));

    return [hasEvenY(Q) ? 0n : 1n, bytesFromBigint(Q?.x ?? 0n)];
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

    public getTaprootResults(): { pubkey: Buffer; address: string; output: Buffer } {
        const root = this.getRoot();
        const t = taggedHash('TapTweak', Buffer.concat([bigintToBufferBE(this.internalPubkey, 256), root]));
        const mult = pointMul(G, bigintFromBytes(t));
        const yeven = lift_x(this.internalPubkey).y;
        const q = pointAdd({ x: this.internalPubkey, y: yeven }, mult);
        const pubkey = bigintToBufferBE(q!.x, 256);

        const temp = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(this.internalPubkey, 256),
            hash: this.getRoot(),
            network: bitcoin.networks[agentConf.bitcoinNodeNetwork as keyof typeof bitcoin.networks]
        });

        if (pubkey.compare(temp.pubkey!) != 0) throw new Error("Values don't match");
        return { pubkey: temp.pubkey!, address: temp.address!, output: temp.output! };
    }

    public getTaprootPubkey(): Buffer {
        return this.getTaprootResults().pubkey;
    }

    public getTaprootOutput(): Buffer {
        return this.getTaprootResults().output;
    }

    public getTaprootAddress(): string {
        return this.getTaprootResults().address;
    }
}

export class Compressor {
    private depth: number;
    private data: Buffer[][];
    private nextIndex: number = 0;
    private indexToSave: number;
    private indexesForProof: string[] = [];
    private internalPubKey: bigint;
    private lastHash: Buffer = DEAD_ROOT;
    public script?: Buffer;
    public proof: Buffer[] = [];
    public total: number;
    public count: number = 0;

    constructor(total: number, indexToSave: number = -1) {
        const log2 = Math.ceil(Math.log2(total));
        this.depth = log2 + 1;
        this.total = 2 ** log2;
        this.data = array(this.depth, (_) => []);
        this.internalPubKey = agentConf.internalPubkey;
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

    setInteralPubKey(internalPubKey: bigint) {
        this.internalPubKey = internalPubKey;
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
            }
        }
    }

    public addHash(hash: Buffer) {
        if (!hash) throw new Error('Hash cannot be null');
        if (this.nextIndex + 1 > 2 ** this.depth) throw new Error('Too many leaves');
        if ((this.nextIndex ^ 1) === this.indexToSave) this.proof![0] = hash;
        last(this.data).push(hash);
        this.nextIndex++;
        this.count++;
        this.lastHash = hash;
        this.compress();
    }

    public getRoot(): Buffer {
        if (this.count === 0) {
            return DEAD_ROOT;
        }
        while (this.count < this.total) {
            this.addHash(this.lastHash);
        }
        return this.data[0][0];
    }

    public static toPubKey(internalPubkey: bigint, root: Buffer): Buffer {
        const taproot = bitcoin.payments.p2tr({
            internalPubkey: bigintToBufferBE(internalPubkey, 256),
            hash: root,
            network: bitcoin.networks[agentConf.bitcoinNodeNetwork as keyof typeof bitcoin.networks]
        });
        return taproot.output!;
    }

    public getTaprootPubkey(): Buffer {
        return Compressor.toPubKey(this.internalPubKey, this.getRoot());
    }

    public getControlBlock(): Buffer {
        const h = this.getRoot();
        const [parity, _] = taprootTweakPubkey(this.internalPubKey, h);
        const P = lift_x(this.internalPubKey);
        const versionBuf = Buffer.from([taprootVersion | Number(parity)]);
        const keyBuf = Buffer.from(padHex(P.x.toString(16), 32), 'hex');
        return Buffer.concat([versionBuf, keyBuf, ...this.proof]);
    }
}

function test1() {
    const hashes = range(0, 7).map((n) => bigintToBufferBE(BigInt(n), 256));
    const compressor = new Compressor(hashes.length, 5);
    hashes.forEach((b) => compressor.addHash(b));
    const root = compressor.getRoot();
    const cb = compressor.getControlBlock();
    console.log(root, cb);
}

function main() {
    test1();
}

if (require.main === module) {
    main();
}
