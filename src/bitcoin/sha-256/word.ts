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
            for (let j = 0; j < 4; j++) {
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
            for (let j = 0; j < 4; j++) {
                ar.unshift((this.items[i].value & (2 ** j)) ? 1 : 0);
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

    fromBits(bits: StackItem[]) {
        for (let i = 0; i < 8; i++) {
            fromBits(this.items[i], [bits[i * 4], bits[i * 4 + 1], bits[i * 4 + 2], bits[i * 4 + 3]]);
        }
    }
}

export function makeBits(w?: Word): StackItem[] {
    const bits: StackItem[] = [];
    if (w) {
        const temp = bitcoin.newStackItem();
        for (let i = 0; i < w.items.length; i++) {
            bitcoin.mov(temp, w.items[i]);
            const lbits = [ bitcoin.newStackItem(), bitcoin.newStackItem(), bitcoin.newStackItem(), bitcoin.newStackItem()];
            bits.push(...lbits);
            for (let j = 3; j >= 0; j--) {
                bitcoin.pick(temp);
                bitcoin.OP_0_16(2 ** j);
                bitcoin.OP_GREATERTHANOREQUAL();
                bitcoin.OP_IF_SMARTASS(() => {
                    bitcoin.setBit_1(lbits[j]);
                    bitcoin.pick(temp);
                    bitcoin.OP_0_16(2 ** j);
                    bitcoin.OP_SUB();
                    bitcoin.replaceWithTop(temp);
                });
            }
        }
        bitcoin.drop(temp);
    } else {
        for (let i = 0; i < 32; i++) bits.push(bitcoin.newStackItem());
    }
    return bits;
}

export function dropBits(bits: StackItem[]) {
    for (let i = 0; i < bits.length; i++) bits[i] && bitcoin.drop(bits[i]);
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

        bitcoin.OP_IF_SMARTASS(() => {
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

export function addHardcoded(target: Word, a: Word, hc: bigint) {
    const carry = bitcoin.newStackItem(0);
    const bItems = [];
    for (let i = 0; i < 8; i++) {
        bItems[i] = Number(hc & 0x0fn);
        hc = hc >> 4n;
    }
    for (let i = 0; i < 8; i++) {
        bitcoin.pick(a.items[i]);
        bitcoin.OP_0_16(bItems[i]);
        bitcoin.OP_ADD();
        if (i > 0) {
            bitcoin.pick(carry);
            bitcoin.OP_ADD();
        }
        bitcoin.OP_DUP();
        bitcoin.OP_0_16(15);
        bitcoin.OP_LESSTHANOREQUAL();
        bitcoin.OP_IF_SMARTASS(() => {
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

