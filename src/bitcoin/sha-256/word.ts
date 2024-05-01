import { Bitcoin } from "../bitcoin";
import { StackItem } from "../stack";

export const bitcoin: Bitcoin = new Bitcoin();

export class Word {
    items: StackItem[];

    constructor(n?: bigint) {
        n = n ?? 0n;
        this.items = [];
        for (let i = 0; i < 8; i++) {
            this.items[i] = bitcoin.newStackItem(Number(n & 0x0fn));
            n = n >> 4n;
        }
    }

    toNumber(): bigint {
        let n = 0n;
        for (let i = 0; i < this.items.length; i++) {
            n += BigInt(this.items[i].value) << (BigInt(i) * 4n);
        }
        return n;
    }

    toBinary(): string {
        let s = '';
        for (let i = 0; i < this.items.length; i++) {
            for (let  j = 0; j < 4; j++) {
                s = s + (this.items[i].value & (2 ** j) ? '1' : '0');
            }
        }
        return s;
    }

    static fromBinary(bin: string): Word {
        let n = 0n;
        let lsb = '';
        for (let i = 0; i < bin.length; i++) lsb = bin[i] + lsb;
        for (let i = 0; i < lsb.length; i++) {
            if (lsb[i] == '1') n = n + (2n ** BigInt(i))
        }
        return new Word(n);
    }

    toPyString(): string {
        const ar = [];
        for (let i = 0; i < this.items.length; i++) {
            for (let  j = 0; j < 4; j++) {
                ar.unshift(this.items[i].value & (2 ** j) ? 1 : 0);
            }
        }
        return '[' + ar.join(', ') + ']';
    }

    set(w: Word) {
        for (let i = 0; i < 8; i++) {
            bitcoin.pick(w.items[i]);
            bitcoin.replaceWithTop(this.items[i]);
        }
    }

    free() {
        this.items.forEach(si => bitcoin.drop(si));
    }

    eq(si: StackItem, w: Word) {
        bitcoin.setBit_1(si);
        const t = bitcoin.newStackItem(0);
        for (let i = 0; i < this.items.length; i++) {
            bitcoin.equals(t, this.items[i], w.items[i])
            bitcoin.and(si, si, t);
        }
        bitcoin.drop(t);
    }
}

function makeBits(n: number): StackItem[] {
    const bits = [];
    for (let i = 0; i < n; i++) bits[i] = bitcoin.newStackItem();
    return bits;
}

function dropBits(bits: StackItem[]) {
    for (let i = 0; i < bits.length; i++) bits[i] && bitcoin.drop(bits[i]);
}

function toBits(bits: StackItem[], si: StackItem) {
    const temp = bitcoin.newStackItem();
    bitcoin.mov(temp, si);
    for (let i = 3; i >= 0; i--) {
        bitcoin.pick(temp);
        bitcoin.OP_0_16(2 ** i);
        bitcoin.OP_GREATERTHANOREQUAL();
        bitcoin.OP_IF(() => {
            bitcoin.setBit_1(bits[i])
            bitcoin.pick(temp);
            bitcoin.OP_0_16(2 ** i);
            bitcoin.OP_SUB();
            bitcoin.replaceWithTop(temp);
        }, () => {
            bitcoin.setBit_0(bits[i]);
        });
    }
    bitcoin.drop(temp);
}

function fromBits(si: StackItem, bits: StackItem[]) {
    bitcoin.setBit_0(si);
    for (let i = 0; i < bits.length; i++) {
        if (!bits[i]) continue;
        bitcoin.ifTrue(bits[i], () => {
            bitcoin.pick(si);
            bitcoin.OP_0_16(2 ** i);
            bitcoin.OP_ADD();
            bitcoin.replaceWithTop(si)
        });
    }
}

function fromBitsNot(si: StackItem, bits: StackItem[]) {
    bitcoin.OP_0_16(0);
    bitcoin.replaceWithTop(si);
    for (let i = 0; i < bits.length; i++) {
        if (!bits[i]) continue;
        bitcoin.ifTrue(bits[i], () => { }, () => {
            bitcoin.pick(si);
            bitcoin.OP_0_16(2 ** i);
            bitcoin.OP_ADD();
            bitcoin.replaceWithTop(si)
        });
    }
}

export function rotr(target: Word, source: Word, n: number) {
    const bits = makeBits(32);
    for (let i = 0; i < 8; i++) {
        toBits([bits[i * 4], bits[i * 4 + 1], bits[i * 4 + 2], bits[i * 4 + 3]], source.items[i]);
    }
    for (let i = 0; i < n; i++) bits.push(bits.shift()!);
    for (let i = 0; i < 8; i++) {
        fromBits(target.items[i], [bits[i * 4], bits[i * 4 + 1], bits[i * 4 + 2], bits[i * 4 + 3]]);
    }
    dropBits(bits);
}

export function shr(target: Word, source: Word, n: number) {
    const bits = makeBits(32);
    for (let i = 0; i < 8; i++) {
        toBits([bits[i * 4], bits[i * 4 + 1], bits[i * 4 + 2], bits[i * 4 + 3]], source.items[i]);
    }
    for (let i = 0; i < n; i++) {
        const bit = bits.shift()!;
        bitcoin.setBit_0(bit);
        bits.push(bit);
    }
    for (let i = 0; i < 8; i++) {
        fromBits(target.items[i], [bits[i * 4], bits[i * 4 + 1], bits[i * 4 + 2], bits[i * 4 + 3]]);
    }
    dropBits(bits);
}

export function and(target: Word, a: Word, b: Word) {
    const aBits = makeBits(4);
    const bBits = makeBits(4);
    for (let i = 0; i < 8; i++) {
        toBits(aBits, a.items[i]);
        toBits(bBits, b.items[i]);
        for (let j = 0; j < 4; j++) {
            bitcoin.and(aBits[j], aBits[j], bBits[j]);
        }
        fromBits(target.items[i], aBits);
    }
    dropBits(aBits);
    dropBits(bBits);
}

export function xor(target: Word, a: Word, b: Word) {
    const aBits = makeBits(4);
    const bBits = makeBits(4);
    for (let i = 0; i < 8; i++) {
        toBits(aBits, a.items[i]);
        toBits(bBits, b.items[i]);
        for (let j = 0; j < 4; j++) bitcoin.xor(aBits[j], aBits[j], bBits[j]);
        fromBits(target.items[i], aBits);
    }
    dropBits(aBits);
    dropBits(bBits);
}

export function xorxor(target: Word, a: Word, b: Word, c: Word) {
    xor(target, a, b);
    xor(target, target, c);
}

export function not(target: Word, source: Word) {
    const bits = makeBits(4);
    for (let i = 0; i < 8; i++) {
        toBits(bits, source.items[i]);
        fromBitsNot(target.items[i], bits);
    }
    dropBits(bits);
}

export function add(target: Word, a: Word, b: Word) {
    const carry = bitcoin.newStackItem(0);
    for (let i = 0; i < 8; i++) {
        bitcoin.pick(a.items[i]);
        bitcoin.pick(b.items[i]);
        bitcoin.OP_ADD();
        if (i > 0) {
            bitcoin.pick(carry);
            bitcoin.OP_ADD();
        }
        bitcoin.OP_DUP();
        bitcoin.OP_0_16(15);
        bitcoin.OP_LESSTHANOREQUAL();
        bitcoin.OP_IF(() => {
            bitcoin.replaceWithTop(target.items[i]);
            bitcoin.setBit_0(carry);
        }, () => {
            bitcoin.OP_0_16(16);
            bitcoin.OP_SUB();
            bitcoin.replaceWithTop(target.items[i]);
            bitcoin.setBit_1(carry);
        });
    }
    bitcoin.drop(carry);
}
