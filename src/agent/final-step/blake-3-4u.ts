import assert from 'assert';
import { Bitcoin } from '../../generator/btc_vm/bitcoin';
import { StackItem } from '../../generator/btc_vm/stack';
import { blake3 as blake3_wasm } from 'hash-wasm';
import { array } from '../common';

const OUT_LEN = 32;
const BLOCK_LEN = 64;
const ROOT = 1 << 3;

const MSG_PERMUTATION = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

export type Register = StackItem[];

export class BLAKE3 {
    bitcoin: Bitcoin;

    andTable: StackItem[] = [];
    xorTable: StackItem[] = [];
    notTable: StackItem[] = [];
    breakValueTable: StackItem[] = [];
    breakCarryTable: StackItem[] = [];
    mul16Table: StackItem[] = [];

    constructor(bitcoin: Bitcoin) {
        this.bitcoin = bitcoin;
    }

    public initializeTables() {
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                this.andTable[i * 16 + j] = this.bitcoin.newStackItem(i & j);
            }
        }
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 16; j++) {
                this.xorTable[i * 16 + j] = this.bitcoin.newStackItem(i ^ j);
            }
        }
        for (let i = 0; i < 16; i++) {
            this.notTable[i] = this.bitcoin.newStackItem(i ^ 15);
        }
        for (let i = 0; i < 32; i++) {
            this.breakValueTable[i] = this.bitcoin.newStackItem(i & 15);
        }
        for (let i = 0; i < 32; i++) {
            this.breakCarryTable[i] = this.bitcoin.newStackItem(i >> 4);
        }
        for (let i = 0; i < 16; i++) {
            this.mul16Table[i] = this.bitcoin.newStackItem(i * 16);
        }
    }

    public newRegister(n: number): Register {
        return new Array(8).fill(0).map((_, i) => this.bitcoin.newStackItem((n >> (i * 4)) & 15));
    }

    public registerToBigint(r: Register): bigint {
        let n = 0n;
        for (let i = 0; i < r.length; i++) n += BigInt(r[i].value as number) << BigInt(i * 4);
        return n;
    }

    round(state: Register[], m: Register[]) {
        // Mix the columns.
        this.g(state, 0, 4, 8, 12, m[0], m[1]);
        this.g(state, 1, 5, 9, 13, m[2], m[3]);
        this.g(state, 2, 6, 10, 14, m[4], m[5]);
        this.g(state, 3, 7, 11, 15, m[6], m[7]);
        // Mix the diagonals.
        this.g(state, 0, 5, 10, 15, m[8], m[9]);
        this.g(state, 1, 6, 11, 12, m[10], m[11]);
        this.g(state, 2, 7, 8, 13, m[12], m[13]);
        this.g(state, 3, 4, 9, 14, m[14], m[15]);
    }

    permute(m: Register[]) {
        const original = [...m];
        for (let i = 0; i < 16; i++) {
            m[i] = original[MSG_PERMUTATION[i]];
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

            this.bitcoin.OP_0_16(16);
            this.bitcoin.OP_GREATERTHANOREQUAL();
            this.bitcoin.OP_DUP();
            this.bitcoin.OP_TOALTSTACK();

            this.bitcoin.OP_IF();

            // hack
            const tv = Number(this.bitcoin.stack.top().value);

            this.bitcoin.OP_0_16(16);
            this.bitcoin.OP_SUB();
            this.bitcoin.OP_ENDIF();

            // hack
            this.bitcoin.stack.top().value = tv % 16;

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
            const orig = [...target];
            for (let i = 0; i < target.length; i++) target[i] = orig[(i + 2) % target.length];
            this.rotl1(target);
        } else if (n % 4 == 0) {
            const orig = [...target];
            const nibs = n / 4;
            for (let i = 0; i < target.length; i++) target[i] = orig[(i + nibs) % target.length];
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
        assert((tx + ty) % 2n ** 32n == tt);
    }

    mov(target: Register, x: Register) {
        target.forEach((t, i) => this.bitcoin.mov(t, x[i]));
    }

    private mov_hc(target: Register, x: number) {
        const xa = new Array(8).fill(0).map((_, i) => (x >> (i * 4)) & 15);
        target.forEach((t, i) => {
            this.bitcoin.DATA(xa[i]);
            this.bitcoin.replaceWithTop(t);
        });
    }

    zero(target: Register) {
        target.forEach((si) => this.bitcoin.setBit_0(si));
    }

    // The mixing function, G, which mixes either a column or a diagonal.
    g(state: Register[], a: number, b: number, c: number, d: number, mx: Register, my: Register) {
        const t = this.newRegister(0);
        this.add(t, state[b], mx);
        this.add(state[a], state[a], t);
        this.xor(state[d], state[d], state[a]);
        this.rotr(state[d], 16);
        this.add(state[c], state[c], state[d]);
        this.xor(state[b], state[b], state[c]);
        this.rotr(state[b], 12);
        this.add(t, state[b], my);
        this.add(state[a], state[a], t);
        this.xor(state[d], state[d], state[a]);
        this.rotr(state[d], 8);
        this.add(state[c], state[c], state[d]);
        this.xor(state[b], state[b], state[c]);
        this.rotr(state[b], 7);
        this.bitcoin.drop(t);
    }

    compress(blockWords: Register[], blockLen: number, flags: number): Register[] {
        const state = [
            0x6a09e667,
            0xbb67ae85,
            0x3c6ef372,
            0xa54ff53a,
            0x510e527f,
            0x9b05688c,
            0x1f83d9ab,
            0x5be0cd19,
            0x6a09e667,
            0xbb67ae85,
            0x3c6ef372,
            0xa54ff53a,
            0,
            0,
            blockLen,
            flags
        ].map((n) => this.newRegister(n));

        assert(blockWords.length == 16);
        // block = list(block_words) ????
        const block = [...blockWords];

        this.round(state, block); // round 1
        this.permute(block);
        this.round(state, block); // round 2
        this.permute(block);
        this.round(state, block); // round 3
        this.permute(block);
        this.round(state, block); // round 4
        this.permute(block);
        this.round(state, block); // round 5
        this.permute(block);
        this.round(state, block); // round 6
        this.permute(block);
        this.round(state, block); // round 7

        const initialChainingValues = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ].map((n) => this.newRegister(n));

        for (let i = 0; i < 8; i++) {
            this.xor(state[i], state[i], state[i + 8]);
            this.xor(state[i + 8], state[i + 8], initialChainingValues[i]);
        }

        return state;
    }

    public static registerToBigint(r: Register): number {
        return r.reduce((p, c, i) => (p += Number(c.value) << (i * 4)), 0);
    }

    hash(blockWords: Register[]): Register[] {
        const blockLen = blockWords.length * 4;
        while (blockWords.length < BLOCK_LEN / 4) blockWords.push(this.newRegister(0));
        const result = this.compress(blockWords, blockLen, 3 | ROOT);
        return result.slice(0, OUT_LEN / 4);
    }

    nibblesToRegisters(si: StackItem[]): Register[] {
        const regs: Register[] = array(Math.ceil(si.length / 8), () => []);
        si.forEach((tsi, i) => (regs[Math.floor(i / 8)][i % 8] = tsi));
        return regs;
    }

    public bufferToNibbles(b: Buffer): StackItem[] {
        const result: StackItem[] = [];
        for (let i = 0; i < b.length; i++) {
            result.push(this.bitcoin.newStackItem(b[i] & 0x0f));
            result.push(this.bitcoin.newStackItem((b[i] >> 4) & 0x0f));
        }
        return result;
    }
}

function registersToHex(h2Regs: Register[]): string {
    let h2 = '';
    for (const r of h2Regs) {
        const n = BLAKE3.registerToBigint(r);
        for (let i = 0; i < 4; i++) h2 += ((n >> (i * 8)) & 255).toString(16).padStart(2, '0');
    }
    return h2;
}

async function test1() {
    console.log('Testing hash for 256 bit value');

    const test1Hex = 'ef6d3a2e4cbe60ba5dd3b13a143adddfebd4c522d3c5618cadd9c7e72e51712a';
    const test1Buf = Buffer.from(test1Hex, 'hex');

    const h1 = await blake3_wasm(test1Buf);
    console.log('h1', h1);

    const bitcoin = new Bitcoin();
    const blake3 = new BLAKE3(bitcoin);
    blake3.initializeTables();

    const blockWords: Register[] = new Array(8)
        .fill(0)
        .map((_, i) => test1Buf.readInt32LE(i * 4))
        .map((n) => blake3.newRegister(n));

    const h2Regs = blake3.hash(blockWords);
    const h2 = registersToHex(h2Regs);

    console.log('h2', h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    assert(h1 == h2);
}

async function test2() {
    console.log('Testing hash for 512 bit value');

    const test1Hex = 'ef6d3a2e4cbe60ba5dd3b13a143adddfebd4c522d3c5618cadd9c7e72e51712a';
    const test2Hex = '60ba5dd3b13a1d9c7e72e51712a43adddfebd4c522d3c56ef6d3a2e4cbe18cad';
    const test1Buf = Buffer.from(test1Hex + test2Hex, 'hex');

    const h1 = await blake3_wasm(test1Buf);
    console.log('h1', h1);

    const bitcoin = new Bitcoin();
    const blake3 = new BLAKE3(bitcoin);
    blake3.initializeTables();

    const blockWords: Register[] = new Array(16)
        .fill(0)
        .map((_, i) => test1Buf.readInt32LE(i * 4))
        .map((n) => blake3.newRegister(n));

    const h2Regs = blake3.hash(blockWords);
    const h2 = registersToHex(h2Regs);

    console.log('h2', h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    // console.log(stats);
    assert(h1 == h2);
}

async function test4() {
    console.log('Testing hash of 512 bit values with nibble conversion');

    const test1Hex = 'ef6d3a2e4cbe60ba5dd3b13a143adddfebd4c522d3c5618cadd9c7e72e51712a';
    const test2Hex = '60ba5dd3b13a1d9c7e72e51712a43adddfebd4c522d3c56ef6d3a2e4cbe18cad';
    const test1Buf = Buffer.from(test1Hex + test2Hex, 'hex');

    const h1 = await blake3_wasm(test1Buf);
    console.log('h1', h1);

    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = true;

    const blake3 = new BLAKE3(bitcoin);
    blake3.initializeTables();

    const nibbles: StackItem[] = blake3.bufferToNibbles(test1Buf);
    const blockWords: Register[] = blake3.nibblesToRegisters(nibbles);

    const resaultBuf = Buffer.from(h1, 'hex');
    const resultNibbles: StackItem[] = blake3.bufferToNibbles(resaultBuf);
    const resultWords: Register[] = blake3.nibblesToRegisters(resultNibbles);

    const h2Regs = blake3.hash(blockWords);
    bitcoin.drop(blockWords.flat());

    for (let i = 0; i < resultWords.length; i++) {
        for (let j = 0; j < resultWords[i].length; j++) {
            bitcoin.assertEqual(resultWords[i][j], h2Regs[i][j]);
        }
    }

    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);

    assert(bitcoin.success);
}

async function main() {
    await test1();
    await test2();
    await test4();
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
