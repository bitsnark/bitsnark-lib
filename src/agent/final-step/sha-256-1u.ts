import assert from "assert";
import { Bitcoin } from "../../generator/step3/bitcoin";
import { StackItem } from "../../generator/step3/stack";
import { _256To32BE, _32To256BE, hash, hashPair } from '../../../src/encoding/encoding';

export type Register = StackItem[];

const hHex = [0x6a09e667n, 0xbb67ae85n, 0x3c6ef372n, 0xa54ff53an, 0x510e527fn, 0x9b05688cn, 0x1f83d9abn, 0x5be0cd19n];

const kHex = [0x428a2f98n, 0x71374491n, 0xb5c0fbcfn, 0xe9b5dba5n, 0x3956c25bn, 0x59f111f1n, 0x923f82a4n,
    0xab1c5ed5n, 0xd807aa98n, 0x12835b01n, 0x243185ben, 0x550c7dc3n, 0x72be5d74n, 0x80deb1fen,
    0x9bdc06a7n, 0xc19bf174n, 0xe49b69c1n, 0xefbe4786n, 0x0fc19dc6n, 0x240ca1ccn, 0x2de92c6fn,
    0x4a7484aan, 0x5cb0a9dcn, 0x76f988dan, 0x983e5152n, 0xa831c66dn, 0xb00327c8n, 0xbf597fc7n,
    0xc6e00bf3n, 0xd5a79147n, 0x06ca6351n, 0x14292967n, 0x27b70a85n, 0x2e1b2138n, 0x4d2c6dfcn,
    0x53380d13n, 0x650a7354n, 0x766a0abbn, 0x81c2c92en, 0x92722c85n, 0xa2bfe8a1n, 0xa81a664bn,
    0xc24b8b70n, 0xc76c51a3n, 0xd192e819n, 0xd6990624n, 0xf40e3585n, 0x106aa070n, 0x19a4c116n,
    0x1e376c08n, 0x2748774cn, 0x34b0bcb5n, 0x391c0cb3n, 0x4ed8aa4an, 0x5b9cca4fn, 0x682e6ff3n,
    0x748f82een, 0x78a5636fn, 0x84c87814n, 0x8cc70208n, 0x90befffan, 0xa4506cebn, 0xbef9a3f7n,
    0xc67178f2n];

export class SHA256 {

    bitcoin: Bitcoin;

    W: Register[] = [];
    t1: Register;
    T0: Register;
    T1: Register;
    T2: Register;
    hash: Register[] = [];
    h: Register[] = [];

    breakTable: StackItem[] = [];

    constructor(bitcoin: Bitcoin) {

        this.bitcoin = bitcoin;

        this.T0 = this.newRegister(0n);
        this.T1 = this.newRegister(0n);
        this.T2 = this.newRegister(0n);
        this.t1 = this.newRegister(0n);
        for (let i = 0; i < 8; i++) {
            this.hash[i] = this.newRegister(0n);
            this.h[i] = this.newRegister(0n);
        }
        this.breakTable[0] = this.bitcoin.newStackItem(0n);
        this.breakTable[1] = this.bitcoin.newStackItem(1n);
        this.breakTable[2] = this.bitcoin.newStackItem(0n);
        this.breakTable[3] = this.bitcoin.newStackItem(1n);
    }

    public hardcodeRegister(n: bigint): Register {
        return new Array(32).fill(0)
            .map((_, i) => this.bitcoin.newStackItem((n >> BigInt(i)) & 1n));
    }

    public hardcodeRegisters(na: bigint[]): Register[] {
        return na.map(n => this.hardcodeRegister(n));
    }

    public newRegister(n: bigint): Register {
        return new Array(32).fill(0)
            .map((_, i) => this.bitcoin.newStackItem((n >> BigInt(i)) & 1n));
    }

    public registerToBigint(r: Register): bigint {
        let n = 0n;
        r.forEach((si, i) => n += si.value << BigInt(i));
        return n;
    }

    public free() {
        this.bitcoin.drop(this.T0);
        this.bitcoin.drop(this.T1);
        this.bitcoin.drop(this.T2);
        this.bitcoin.drop(this.t1);
        for (let i = 0; i < 8; i++) {
            this.bitcoin.drop(this.hash[i]);
            this.bitcoin.drop(this.h[i]);
        }
    }

    and(target: Register, x: Register, y: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_BOOLAND();
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    not(target: Register, x: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.OP_NOT();
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    xor(target: Register, x: Register, y: Register) {
        for (let i = 0; i < target.length; i++) {
            this.bitcoin.pick(x[i]);
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_ADD();
            this.bitcoin.OP_0_16(1n);
            this.bitcoin.OP_EQUAL();
            this.bitcoin.replaceWithTop(target[i]);
        }
    }

    rotr(target: Register, x: Register, n: number) {

        let s = this.registerToBigint(x).toString(2);
        while (s.length < 32) s = '0' + s;
        const t = s.slice(s.length - n) + s.slice(0, s.length - n);
        const tn = BigInt(`0b${t}`);

        for (let i = 0; i < 32; i++) {
            const t = i - n >= 0 ? i - n : 32 + i - n;
            this.bitcoin.mov(target[t], x[i]);
        }

        const tt = this.registerToBigint(target);
        assert(tn == tt);
    }

    shr(target: Register, x: Register, n: number) {
        let s = this.registerToBigint(x).toString(2);
        while (s.length < 32) s = '0' + s;
        const t = new Array(n).fill('0').join('') + s.slice(0, s.length - n);
        const tn = BigInt(`0b${t}`);

        this.mov_hc(target, 0n);
        for (let i = 0; i < 32; i++) {
            if (i - n >= 0) this.bitcoin.mov(target[i - n], x[i]);
        }

        const tt = this.registerToBigint(target);
        assert(tn == tt);
    }

    add(target: Register, x: Register, y: Register) {

        const tx = this.registerToBigint(x);
        const ty = this.registerToBigint(y);

        for (let i = 0; i < target.length; i++) {
            if (i == 0) {
                this.bitcoin.OP_0_16(0n);        
            } else {
                this.bitcoin.OP_FROMALTSTACK();
            }
            this.bitcoin.pick(x[i]);
            this.bitcoin.pick(y[i]);
            this.bitcoin.OP_ADD();
            this.bitcoin.OP_ADD();
            if (i + 1 < target.length) {
                this.bitcoin.OP_DUP();
                this.bitcoin.OP_0_16(2n);
                this.bitcoin.OP_GREATERTHANOREQUAL();
                this.bitcoin.OP_TOALTSTACK();
            }
            this.bitcoin.tableFetchInStack(this.breakTable);
            this.bitcoin.replaceWithTop(target[i]);    
        }

        const tt = this.registerToBigint(target);
        assert((tx + ty) % (2n ** 32n) == tt);
    }

    addK(target: Register, x: Register, ki: number) {

        const krn = new Array(32).fill(0)
            .map((_, i) => (kHex[ki] >> BigInt(i)) & 1n);

        const tx = this.registerToBigint(x);
        const ty = kHex[ki];

        for (let i = 0; i < target.length; i++) {
            if (i == 0) {
                this.bitcoin.OP_0_16(0n);        
            } else {
                this.bitcoin.OP_FROMALTSTACK();
            }
            this.bitcoin.pick(x[i]);
            this.bitcoin.DATA(krn[i]);
            this.bitcoin.OP_ADD();
            this.bitcoin.OP_ADD();
            if (i + 1 < target.length) {
                this.bitcoin.OP_DUP();
                this.bitcoin.OP_0_16(2n);
                this.bitcoin.OP_GREATERTHANOREQUAL();
                this.bitcoin.OP_TOALTSTACK();
            }
            this.bitcoin.tableFetchInStack(this.breakTable);
            this.bitcoin.replaceWithTop(target[i]);    
        }

        const tt = this.registerToBigint(target);
        assert((tx + ty) % (2n ** 32n) == tt);
    }

    mov(target: Register, x: Register) {
        target.forEach((t, i) => this.bitcoin.mov(t, x[i]));
    }

    mov_hc(target: Register, x: bigint) {
        target.forEach((t, i) => {
            this.bitcoin.DATA((x >> BigInt(i)) & 1n);
            this.bitcoin.replaceWithTop(t);
        });
    }

    zero(target: Register) {
        target.forEach(si => this.bitcoin.setBit_0(si));
    }

    ch(target: Register, x: Register, y: Register, z: Register) {
        this.and(target, x, y);
        this.not(this.t1, x);
        this.and(this.t1, this.t1, z);
        this.xor(target, target, this.t1);
    }

    maj(target: Register, x: Register, y: Register, z: Register) {
        this.and(target, x, y);
        this.and(this.t1, x, z);
        this.xor(target, target, this.t1);
        this.and(this.t1, y, z);
        this.xor(target, target, this.t1);
    }

    bigsigma0(target: Register, x: Register) {
        this.rotr(target, x, 2);
        this.rotr(this.t1, x, 13);
        this.xor(target, target, this.t1);
        this.rotr(this.t1, x, 22);
        this.xor(target, target, this.t1);
    }

    bigsigma1(target: Register, x: Register) {
        this.rotr(target, x, 6);
        this.rotr(this.t1, x, 11);
        this.xor(target, target, this.t1);
        this.rotr(this.t1, x, 25);
        this.xor(target, target, this.t1);
    }

    sigma0(target: Register, x: Register) {
        this.rotr(target, x, 7);
        this.rotr(this.t1, x, 18);
        this.xor(target, target, this.t1);
        this.shr(this.t1, x, 3);
        this.xor(target, target, this.t1);
    }

    sigma1(target: Register, x: Register) {
        this.rotr(target, x, 17);
        this.rotr(this.t1, x, 19);
        this.xor(target, target, this.t1);
        this.shr(this.t1, x, 10);
        this.xor(target, target, this.t1);
    }

    calculateW(index: number) {
        this.add(this.W[index], this.W[index], this.W[(index + 9) & 0xf]);
        this.sigma1(this.T1, this.W[(index + 14) & 0xf]);
        this.add(this.W[index], this.W[index], this.T1);
        this.sigma0(this.T1, this.W[(index + 1) & 0xf]);
        this.add(this.W[index], this.W[index], this.T1);
    }

    calculateHash() {
        for (let i = 0; i < 8; i++) {
            this.mov(this.h[i], this.hash[i]);
        }
        for (let i = 0; i < 4; i++) {
            const block = i * 16;
            for (let j = 0; j < 16; j++) {
                if (i > 0) {
                    this.calculateW(j);
                }
                this.bigsigma1(this.T1, this.h[4]);
                this.add(this.T1, this.T1, this.h[7]);
                this.ch(this.T0, this.h[4], this.h[5], this.h[6]);
                this.add(this.T1, this.T1, this.T0);
                this.addK(this.T1, this.T1, block + j);
                this.add(this.T1, this.T1, this.W[j]);

                this.bigsigma0(this.T2, this.h[0]);
                this.maj(this.T0, this.h[0], this.h[1], this.h[2]);
                this.add(this.T2, this.T2, this.T0);

                this.mov(this.h[7], this.h[6]);
                this.mov(this.h[6], this.h[5]);
                this.mov(this.h[5], this.h[4]);
                this.mov(this.h[4], this.h[3]);
                this.add(this.h[4], this.h[4], this.T1);
                this.mov(this.h[3], this.h[2]);
                this.mov(this.h[2], this.h[1]);
                this.mov(this.h[1], this.h[0]);
                this.mov(this.h[0], this.T1);
                this.add(this.h[0], this.h[0], this.T2);
            }
        }
        for (let i = 0; i < 8; i++) {
            this.add(this.hash[i], this.hash[i], this.h[i]);
        }
    }

    public sha256(target: Register[], a: Register[]) {
        for (let i = 0; i < 8; i++) {
            this.mov_hc(this.hash[i], hHex[i]);
        }
        for (let i = 0; i < 8; i++) {
            this.W[i] = a[i];
            this.W[i + 8] = this.hardcodeRegister(0n);
        }
        this.mov_hc(this.W[8], 0x80000000n);
        this.mov_hc(this.W[15], 256n);
        this.calculateHash()
        for (let i = 0; i < 8; i++) {
            this.mov(target[i], this.hash[i]);
            this.bitcoin.drop(this.W[i + 8]);
        }
    }

    public sha256pair(target: Register[], a: Register[], b: Register[]) {
        for (let i = 0; i < 8; i++) {
            this.mov_hc(this.hash[i], hHex[i]);
        }
        for (let i = 0; i < 8; i++) {
            this.W[i] = a[i];
            this.W[i + 8] = b[i];
        }
        this.calculateHash()
        for (let i = 1; i < 15; i++) {
            this.zero(this.W[i]);
        }
        this.mov_hc(this.W[0], 0x80000000n);
        this.mov_hc(this.W[15], 512n);
        this.calculateHash();
        for (let i = 0; i < 8; i++) {
            this.mov(target[i], this.hash[i]);
        }
    }
}



{
    const test1 = 123456789012345678901234567890n;

    const h1 = hash(test1);
    const bitcoin = new Bitcoin();

    const sha256 = new SHA256(bitcoin);
    const regs: Register[] = _256To32BE(test1).map(n => sha256.hardcodeRegister(n));
    const h2regs = _256To32BE(0n).map(n => sha256.newRegister(0n));
    sha256.sha256(h2regs, regs);
    const h2 = _32To256BE(h2regs.map(r => sha256.registerToBigint(r)));
    console.log('h1', h1);
    console.log('h2', h2);
    assert(h1 == h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    sha256.free();
}

{

    const test1 = 123456789012345678901234567890n;
    const test2 = 98765432109876543210987654321n;

    const h1 = hashPair(test1, test2);

    const bitcoin = new Bitcoin();

    const sha256 = new SHA256(bitcoin);

    const aRegs: Register[] = _256To32BE(test1).map(n => sha256.newRegister(n));
    const bRegs: Register[] = _256To32BE(test2).map(n => sha256.newRegister(n));

    const h2regs = _256To32BE(0n).map(n => sha256.newRegister(0n));

    sha256.sha256pair(h2regs, aRegs, bRegs);
    const h2 = _32To256BE(h2regs.map(r => sha256.registerToBigint(r)));

    console.log('h1', h1);
    console.log('h2', h2);
    assert(h1 == h2);
    console.log(`max stack: ${bitcoin.maxStack}    size: ${bitcoin.programSizeInBitcoinBytes()}`);
    sha256.free();
}
