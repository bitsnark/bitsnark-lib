import assert from "assert";
import { Bitcoin } from "../../generator/step3/bitcoin";
import { StackItem } from "../../generator/step3/stack";
import { blake3 as blake3_wasm } from 'hash-wasm';

const OUT_LEN = 32;
const BLOCK_LEN = 64;
const ROOT = 1 << 3;

const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

export type Register = StackItem[];

class Mojo {

    bitcoin: Bitcoin;

    andTable: StackItem[] = [];
    xorTable: StackItem[] = [];
    notTable: StackItem[] = [];
    breakValueTable: StackItem[] = [];
    breakCarryTable: StackItem[] = [];
    mul16Table: StackItem[] = [];

    constructor(bitcoin: Bitcoin) {

        this.bitcoin = bitcoin;

        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                this.andTable[i * 16 + j] = this.bitcoin.newStackItem(BigInt(i & j));
            }
        }
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                this.xorTable[i * 16 + j] = this.bitcoin.newStackItem(BigInt(i ^ j));
            }
        }
        for (let i = 0; i < 16; i++) {
            this.notTable[i] = this.bitcoin.newStackItem(BigInt(i ^ 15));
        }
        for (let i = 0; i < 32; i++) {
            this.breakValueTable[i] = this.bitcoin.newStackItem(BigInt(i & 15));
        }
        for (let i = 0; i < 32; i++) {
            this.breakCarryTable[i] = this.bitcoin.newStackItem(BigInt(i >> 4));
        }
        for (let i = 0; i < 16; i++) {
            this.mul16Table[i] = this.bitcoin.newStackItem(BigInt(i * 16), 2);
        }
    }

    public newRegister(n: bigint): Register {
        return new Array(8).fill(0)
            .map((_, i) => this.bitcoin.newStackItem((n >> BigInt(i * 4)) & 15n));
    }

    public registerToBigint(r: Register): bigint {
        let n = 0n;
        r.forEach((si, i) => n += si.value << BigInt(i * 4));
        return n;
    }

    round(state: Register[], m: Register[]) {
        // Mix the columns.
        this.g(state, 0, 4, 8, 12, m[0], m[1])
        this.g(state, 1, 5, 9, 13, m[2], m[3])
        this.g(state, 2, 6, 10, 14, m[4], m[5])
        this.g(state, 3, 7, 11, 15, m[6], m[7])
        // Mix the diagonals.
        this.g(state, 0, 5, 10, 15, m[8], m[9])
        this.g(state, 1, 6, 11, 12, m[10], m[11])
        this.g(state, 2, 7, 8, 13, m[12], m[13])
        this.g(state, 3, 4, 9, 14, m[14], m[15])
    }

    permute(m: Register[]) {
        const original = [...m];
        for (let i = 0; i < 16; i++) {
            m[i] = original[MSG_PERMUTATION[i]]
        }
    }

    and(target: Register, x: Register, y: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.tableFetchInStack(this.mul16Table);
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_ADD();
            this.bitcoin.tableFetchInStack(this.andTable);
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    not(target: Register, x: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.tableFetchInStack(this.notTable);
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    xor(target: Register, x: Register, y: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.tableFetchInStack(this.mul16Table);
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_ADD();
            this.bitcoin.tableFetchInStack(this.xorTable);
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    private rotl1(target: Register) {

        const stack = this.bitcoin.stack.items;

        let s = this.registerToBigint(target).toString(2);
        while (s.length < 32) s = '0' + s;
        const t = s.slice(1) + s.slice(0, 1);
        const tn = BigInt(`0b${t}`);

        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(target[i]);
            this.bitcoin.OP_DUP();
            this.bitcoin.OP_ADD();
            if (i > 0) {
                this.bitcoin.OP_FROMALTSTACK();
                this.bitcoin.OP_ADD();
            }
            this.bitcoin.OP_DUP();

            this.bitcoin.OP_0_16(16n);
            this.bitcoin.OP_GREATERTHANOREQUAL();
            this.bitcoin.OP_DUP();
            this.bitcoin.OP_TOALTSTACK();

            this.bitcoin.OP_IF();

            // hack
            const tv = this.bitcoin.stack.top().value;

            this.bitcoin.OP_0_16(16n);
            this.bitcoin.OP_SUB();
            this.bitcoin.OP_ENDIF();

            // hack 
            this.bitcoin.stack.top().value = tv % 16n;

            this.bitcoin.replaceWithTop(target[i]);
        }

        this.bitcoin.OP_FROMALTSTACK();
        this.bitcoin.pick(target[0]);
        this.bitcoin.OP_ADD();
        this.bitcoin.replaceWithTop(target[0]);

        const tt = this.registerToBigint(target);
        assert(tn == tt);
    }

    private rotr(target: Register, n: number) {

        let s = this.registerToBigint(target).toString(2);
        while (s.length < 32) s = '0' + s;
        const t = s.slice(s.length - n) + s.slice(0, s.length - n);
        const tn = BigInt(`0b${t}`);

        if (n == 7) {
            const orig = [ ...target ];
            for (let i = 0; i < target.length; i++)
                target[i] = orig[(i + 2) % target.length];
            this.rotl1(target);
        } else if (n % 4 == 0) {
            const orig = [ ...target ];
            const nibs = n / 4;
            for (let i = 0; i < target.length; i++)
                target[i] = orig[(i + nibs) % target.length];
        } else {
            throw new Error('Invalid rotl');
        }

        const tt = this.registerToBigint(target);
        assert(tn == tt);
    }

    add(target: Register, x: Register, y: Register) {

        const tx = this.registerToBigint(x);
        const ty = this.registerToBigint(y);

        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            if (i != 0) {
                this.bitcoin.OP_FROMALTSTACK();
                this.bitcoin.OP_ADD();
            }
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_ADD();
            if (i + 1 < target.length) {
                this.bitcoin.OP_DUP();
                this.bitcoin.tableFetchInStack(this.breakCarryTable);
                this.bitcoin.OP_TOALTSTACK();
                this.bitcoin.tableFetchInStack(this.breakValueTable);
                this.bitcoin.replaceWithTop(target[i]);
            } else {
                this.bitcoin.tableFetchInStack(this.breakValueTable);
                this.bitcoin.replaceWithTop(target[i]);
            }
        }

        const tt = this.registerToBigint(target);
        assert((tx + ty) % (2n ** 32n) == tt);
    }

    mov(target: Register, x: Register) {
        target.forEach((t, i) => this.bitcoin.mov(t, x[i]));
    }

    private mov_hc(target: Register, x: bigint) {
        const xa = new Array(8).fill(0)
            .map((_, i) => (x >> BigInt(i * 4)) & 15n);
        target.forEach((t, i) => {
            this.bitcoin.DATA(BigInt(xa[i]));
            this.bitcoin.replaceWithTop(t);
        });
    }

    zero(target: Register) {
        target.forEach(si => this.bitcoin.setBit_0(si));
    }

    // The mixing function, G, which mixes either a column or a diagonal.
    g(state: Register[], a: number, b: number, c: number, d: number, mx: Register, my: Register) {
        const t = this.newRegister(0n);
        this.add(t, state[b], mx);
        this.add(state[a], state[a], t);
        this.xor(state[d], state[d], state[a]);
        this.rotr(state[d], 16);
        this.add(state[c], state[c], state[d]);
        this.xor(state[b], state[b], state[c]);
        this.rotr(state[b], 12);
        this.add(t, state[b], my)
        this.add(state[a], state[a], t);
        this.xor(state[d], state[d], state[a]);
        this.rotr(state[d], 8);
        this.add(state[c], state[c], state[d]);
        this.xor(state[b], state[b], state[c]);
        this.rotr(state[b], 7);
        this.bitcoin.drop(t);
    }

    compress(
        blockWords: Register[],
        blockLen: number,
        flags: number): Register[] {
    
        const state = [
            0x6A09E667,
            0xBB67AE85,
            0x3C6EF372,
            0xA54FF53A,
            0x510E527F,
            0x9B05688C,
            0x1F83D9AB,
            0x5BE0CD19,
            0x6A09E667,
            0xBB67AE85,
            0x3C6EF372,
            0xA54FF53A,
            0,
            0,
            blockLen,
            flags
        ].map(n => this.newRegister(BigInt(n)));

        assert(blockWords.length == 16);
        // block = list(block_words) ????
        const block = [...blockWords];

        this.round(state, block)  // round 1
        this.permute(block)
        this.round(state, block)  // round 2
        this.permute(block)
        this.round(state, block)  // round 3
        this.permute(block)
        this.round(state, block)  // round 4
        this.permute(block)
        this.round(state, block)  // round 5
        this.permute(block)
        this.round(state, block)  // round 6
        this.permute(block)
        this.round(state, block)  // round 7

        const initialChainingValues = [
            0x6A09E667,
            0xBB67AE85,
            0x3C6EF372,
            0xA54FF53A,
            0x510E527F,
            0x9B05688C,
            0x1F83D9AB,
            0x5BE0CD19,
        ].map(n => this.newRegister(BigInt(n)));

        for (let i = 0; i < 8; i++) {
            this.xor(state[i], state[i], state[i + 8]);
            this.xor(state[i + 8], state[i + 8], initialChainingValues[i]);
        }

        return state;
    }
}

export class BLAKE3 {

    mojo: Mojo;

    constructor(bitcoin: Bitcoin) {
        this.mojo = new Mojo(bitcoin);
    }

    public registerToBigint(r: Register): bigint {
        return r.reduce((p, c, i) => p += (c.value << BigInt(i * 4)), 0n);
    }

    public newRegister(n: bigint): Register {
        return this.mojo.newRegister(n);
    }

    hash(blockWords: Register[]): Register[] {
        const blockLen = blockWords.length * 4;
        while (blockWords.length < BLOCK_LEN / 4) blockWords.push(this.newRegister(0n));
        const result = this.mojo.compress(
            blockWords,
            blockLen,
            3 | ROOT);
        return result.slice(0, OUT_LEN / 4);
    }
}

async function test1() {

    const test1Hex = 'ef6d3a2e4cbe60ba5dd3b13a143adddfebd4c522d3c5618cadd9c7e72e51712a';
    const test1Buf = Buffer.from(test1Hex, 'hex');

    const h1 = await blake3_wasm(test1Buf);
    console.log('h1', h1);

    const bitcoin = new Bitcoin();
    const blake3 = new BLAKE3(bitcoin);
    const blockWords: Register[] = new Array(8).fill(0)
        .map((_, i) => test1Buf.readInt32LE(i * 4))
        .map(n => blake3.newRegister(BigInt(n)));

    const h2Regs = blake3.hash(blockWords);
    let h2 = '';
    for (const r of h2Regs) {
        const n = blake3.registerToBigint(r);
        for (let i = 0; i < 4; i++) 
            h2 += ((n >> (BigInt(i) * 8n)) & 0xffn).toString(16).padStart(2, '0');
    }
    
    console.log('h2', h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    assert(h1 == h2);
}

async function test2() {

    const test1Hex = 'ef6d3a2e4cbe60ba5dd3b13a143adddfebd4c522d3c5618cadd9c7e72e51712a';
    const test2Hex = '60ba5dd3b13a1d9c7e72e51712a43adddfebd4c522d3c56ef6d3a2e4cbe18cad';
    const test1Buf = Buffer.from(test1Hex + test2Hex, 'hex');

    const h1 = await blake3_wasm(test1Buf);
    console.log('h1', h1);

    const bitcoin = new Bitcoin();
    const blake3 = new BLAKE3(bitcoin);
    const blockWords: Register[] = new Array(16).fill(0)
        .map((_, i) => test1Buf.readInt32LE(i * 4))
        .map(n => blake3.newRegister(BigInt(n)));

    const h2Regs = blake3.hash(blockWords);
    let h2 = '';
    for (const r of h2Regs) {
        const n = blake3.registerToBigint(r);
        for (let i = 0; i < 4; i++) 
            h2 += ((n >> (BigInt(i) * 8n)) & 0xffn).toString(16).padStart(2, '0');
    }
    
    console.log('h2', h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    // console.log(stats);
    assert(h1 == h2);
}

test1();
test2();
