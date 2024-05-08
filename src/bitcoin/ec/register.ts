
import { modInverse } from "../../groth16/common/math-utils";
import { Bitcoin } from "../bitcoin";
import { StackItem } from "../stack";

export const bitcoin: Bitcoin = new Bitcoin();
const temp = bitcoin.newStackItem();
const tempBits: StackItem[] = [];
for (let i = 0; i < 272; i++) tempBits.push(bitcoin.newStackItem());

export class Register {
    items: StackItem[];

    constructor(hardcoded?: bigint) {
        hardcoded = hardcoded ?? 0n;
        this.items = [];
        for (let i = 0; i < 17; i++) {
            this.items[i] = bitcoin.newStackItem(Number(hardcoded & 0xffffn));
            hardcoded = hardcoded >> 16n;
        }
    }

    toNumber(): bigint {
        let n = 0n;
        for (let i = 0; i < this.items.length; i++) {
            n += BigInt(this.items[i].value) << (BigInt(i) * 16n);
        }
        return n;
    }

    // fromNumber(n: bigint) {
    //     for (let i = 0; i < 17; i++) {
    //         this.items[i].value = Number(n & 0xffffn);
    //         n = n >> 16n;
    //     }
    // }

    setFrom(r: Register) {
        for (let i = 0; i < r.items.length; i++) {
            bitcoin.pick(r.items[i]);
            bitcoin.replaceWithTop(this.items[i]);
        }
    }

    free() {
        this.items.forEach(si => bitcoin.drop(si));
    }

    eq(si: StackItem, r: Register) {
        bitcoin.setBit_1(si);
        const t = bitcoin.newStackItem();
        for (let i = 0; i < this.items.length; i++) {
            bitcoin.equals(t, this.items[i], r.items[i])
            bitcoin.and(si, si, t);
        }
        bitcoin.drop(t);
    }

    eqHardcoded(si: StackItem, hc: bigint) {
        bitcoin.setBit_1(si);
        for (let i = 0; i < this.items.length; i++) {
            const t = hc & 0xffffn;
            hc = hc >> 16n;
            bitcoin.DATA(Number(t));
            bitcoin.pick(this.items[i]);
            bitcoin.OP_NUMEQUAL();
            bitcoin.pick(si);
            bitcoin.OP_BOOLAND();
            bitcoin.replaceWithTop(si);
        }
    }

    setZero() {
        for (let i = 0; i < this.items.length; i++) {
            bitcoin.setBit_0(this.items[i])
        }
    }
}

const r = new Register();
const tempRegister = new Register();

function add(target: Register, a: Register, b: Register) {

    bitcoin.setBit_0(temp);

    for (let i = 0; i < target.items.length; i++) {
        bitcoin.pick(a.items[i]);
        bitcoin.pick(b.items[i]);
        bitcoin.OP_ADD();
        bitcoin.pick(temp);
        bitcoin.OP_ADD();
        bitcoin.OP_DUP();
        bitcoin.DATA(2 ** 16 - 1);
        bitcoin.OP_LESSTHANOREQUAL();

        bitcoin.OP_IF_SMARTASS(() => {
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_0(temp);
        }, () => {
            bitcoin.DATA(2 ** 16);
            bitcoin.OP_SUB();
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_1(temp);
        });
    }

    if (a.toNumber() + b.toNumber() != r.toNumber()) throw new Error();

    target.setFrom(r);
}

function addHardcoded(target: Register, a: Register, hc: bigint) {
    let thc = hc;
    bitcoin.setBit_0(temp);

    for (let i = 0; i < target.items.length; i++) {
        const t = Number(thc & 0xffffn);
        thc = thc >> 16n;
        bitcoin.pick(a.items[i]);
        bitcoin.DATA(t);
        bitcoin.OP_ADD();
        bitcoin.pick(temp);
        bitcoin.OP_ADD();
        bitcoin.OP_DUP();
        bitcoin.DATA(2 ** 16 - 1);
        bitcoin.OP_LESSTHANOREQUAL();

        bitcoin.OP_IF_SMARTASS(() => {
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_0(temp);
        }, () => {
            bitcoin.DATA(2 ** 16);
            bitcoin.OP_SUB();
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_1(temp);
        });
    }

    if (a.toNumber() + hc != r.toNumber()) throw new Error();
    
    target.setFrom(r);
}

function isGreaterOrEqualHardcoded(si: StackItem, a: Register, hc: bigint) {
    const aNum = a.toNumber();
    bitcoin.setBit_1(si);
    let thc = hc;
    for (let i = a.items.length - 1; i >= 0; i--) {
        const t = thc & 0xffffn;
        thc = thc >> 16n;
        bitcoin.pick(a.items[i]);
        bitcoin.DATA(Number(t));
        bitcoin.OP_GREATERTHANOREQUAL();
        bitcoin.pick(si);
        bitcoin.OP_BOOLAND();
        bitcoin.replaceWithTop(si);
    }
    if (aNum >= hc ? 1 : 0 != si.value) throw new Error();
}

function sub(target: Register, a: Register, b: Register) {
    bitcoin.setBit_0(temp);
    for (let i = 0; i < target.items.length; i++) {
        bitcoin.pick(a.items[i]);
        bitcoin.pick(temp);
        bitcoin.OP_SUB();
        bitcoin.pick(b.items[i]);
        bitcoin.OP_SUB();
        bitcoin.OP_DUP();
        bitcoin.OP_0_16(0);
        bitcoin.OP_GREATERTHANOREQUAL();
        bitcoin.OP_IF_SMARTASS(() => {
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_0(temp);
        }, () => {
            bitcoin.DATA(2 ** 16);
            bitcoin.OP_ADD();
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_1(temp);
        });
    }

    if (a.toNumber() - b.toNumber() != r.toNumber()) throw new Error();

    target.setFrom(r);
}

export function subHardcoded(target: Register, a: Register, hc: bigint) {
    const aNum = a.toNumber();
    let thc = hc;
    bitcoin.setBit_0(temp);
    for (let i = 0; i < target.items.length; i++) {
        const t = thc & 0xffffn;
        thc = thc >> 16n;
        bitcoin.pick(a.items[i]);
        bitcoin.pick(temp);
        bitcoin.OP_SUB();
        bitcoin.DATA(Number(t));
        bitcoin.OP_SUB();
        bitcoin.OP_DUP();
        bitcoin.OP_0_16(0);
        bitcoin.OP_GREATERTHANOREQUAL();
        bitcoin.OP_IF_SMARTASS(() => {
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_0(temp);
        }, () => {
            bitcoin.DATA(2 ** 16);
            bitcoin.OP_ADD();
            bitcoin.replaceWithTop(r.items[i]);
            bitcoin.setBit_1(temp);
        });
    }

    if (aNum > hc && aNum - hc != r.toNumber()) throw new Error();

    target.setFrom(r);
}

export function subMod(target: Register, a: Register, b: Register, prime: bigint) {
    const aNum = a.toNumber();
    const bNum = b.toNumber();
    addHardcoded(target, a, prime);
    sub(target, target, b);
    modForAdd(target, target, prime);
    if ((aNum + bNum) % prime != target.toNumber()) throw new Error();
}

function modForAdd(target: Register, a: Register, prime: bigint) {
    const aNum = a.toNumber();
    target.setFrom(a);
    isGreaterOrEqualHardcoded(temp, a, prime);
    bitcoin.ifTrue(temp, () => {
        subHardcoded(target, a, prime);
    });
    if (aNum % prime != target.toNumber()) throw new Error();
}

export function addMod(target: Register, a: Register, b: Register, p: bigint) {
    const aNum = a.toNumber();
    const bNum = b.toNumber();
    add(target, a, b);
    modForAdd(target, target, p);
    if ((aNum + bNum) % p != target.toNumber()) throw new Error();
}

function toBitsAltStack(r: Register) {
    for (let i = r.items.length - 1; i >= 0; i--) {
        bitcoin.pick(r.items[i]);
        for (let j = 15; j >= 0; j--) {
            bitcoin.OP_DUP();
            bitcoin.DATA(2 ** j);
            bitcoin.OP_GREATERTHANOREQUAL();
            bitcoin.OP_DUP();
            bitcoin.OP_TOALTSTACK();
            bitcoin.OP_IF_SMARTASS(() => {
                bitcoin.DATA(2 ** j);
                bitcoin.OP_SUB();
            });
        }
    }
}

export function mulMod(target: Register, a: Register, b: Register, p: bigint) {

    console.log(`mulMod  in  ---    witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);
    
    const aNum = a.toNumber();
    const bNum = b.toNumber();
    tempRegister.setFrom(a);
    toBitsAltStack(b);
    for (let i = 0; i < 256; i++) {
        bitcoin.OP_FROMALTSTACK();
        bitcoin.OP_IF_SMARTASS(() => {
            addMod(r, r, tempRegister, p);
        });
        addMod(tempRegister, tempRegister, tempRegister, p);
    }

    if ((aNum * bNum) % p != target.toNumber()) throw new Error();

    target.setFrom(r);
    console.log(`mulMod  out  ---    witness: ${bitcoin.witness.length}   stack: ${bitcoin.stack.length()}    opcodes: ${bitcoin.opcodes.length}`);
}

export function divMod(target: Register, a: Register, b: Register, prime: bigint) {
    const aNum = a.toNumber();
    const bNum = b.toNumber();
    if (bNum % prime == 0n) throw new Error('divide by zero');

    const result = aNum * modInverse(bNum, prime);
    const t = new Register(result);
    for (let i = 0; i < t.items.length; i++) {
        bitcoin.witness.push(t.items[i].value);
    }
    target.setFrom(t);
    mulMod(t, target, b, prime);
    t.eq(temp, a);
    bitcoin.assertTrue(temp);
    t.free();
}
