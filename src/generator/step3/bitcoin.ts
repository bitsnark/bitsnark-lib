import { padHex } from "../../encoding/encoding";
import { hardcode, OpcodeType, opcodeValues } from "./bitcoin-opcodes";
import { StackItem, Stack } from "./stack";
import { createHash } from 'crypto';

interface Operation {
    op?: OpcodeType;
    data?: bigint;
    dataSizeInBytes?: number;
    templateItemId?: string;
}

export interface Template {
    buffer: Buffer;
    items: { itemId: string, index: number, sizeInBytes: number }[];
}

export interface SimulatedRegister {
    index: number;
    stackItems: StackItem[];
    hardcoded: boolean;
}

export class Bitcoin {

    opcodes: Operation[] = [];
    simulatedRegisters: Map<number, SimulatedRegister> = new Map<number, SimulatedRegister>();
    stack: Stack = new Stack();
    altStack: bigint[] = [];
    witness: bigint[] = [];
    hardcoded: bigint[] = [];
    success = true;
    public maxStack = 0;
    public throwOnFail = false;

    constructor() {
    }

    reset() {
        this.opcodes = [];
        this.stack = new Stack();
        this.simulatedRegisters = new Map<number, SimulatedRegister>();
        this.success = true;
    }

    fail(msg?: string) {
        this.success = false;
        if (this.throwOnFail)
            throw new Error('Failed: ' + msg);
    }

    /// BASIC ///

    newStackItem(value?: bigint, dataSizeInBytes?: number): StackItem {
        value = value ?? 0n;
        if (value < 0 || value > 16 && !dataSizeInBytes)
            throw new Error('Invalid value');
        const si = this.DATA(value);
        this.maxStack = Math.max(this.maxStack, this.stack.items.length);
        if (this.stack.items.length + this.altStack.length > 1000)
            this.fail('Stack too big');
        return si;
    }

    newNibbles32(): StackItem[] {
        return this.newNibbles(14);
    }

    newNibbles(count: number): StackItem[] {
        return new Array(count).fill(0).map(() => this.newStackItem(0n));
    }

    newNibblesFast(count: number): StackItem[] {
        if (count < 4) throw new Error('Use only for count > 4');

        let n = count;

        this.DATA(0n); // 1
        this.DATA(0n); // 2
        this.OP_2DUP(); // 4
        n -= 4;

        while (n >= 3) {
            this.OP_3DUP();
            n -= 3;
        }
        while (n > 2) {
            this.OP_2DUP();
            n-=2;
        }
        while (n > 0) {
            this.OP_DUP();
            n--;
        }

        return this.stack.items.slice(this.stack.items.length - count);
    }

    private getRelativeStackPosition(si: StackItem): number {

        const index = this.stack.findIndex(si);
        if (index < 0)
            throw new Error('Invalid relative position');
        return this.stack.length() - index - 1;
    }

    public newSimulatedRegister(n: bigint): SimulatedRegister {
        const sr: SimulatedRegister = {
            index: 0,
            stackItems: [],
            hardcoded: false
        };
        for (let i = 0; i < 32; i++) {
            const b = n & 1n;
            n = n >> 1n;
            sr.stackItems.push(this.newStackItem(b));
        }
        return sr;
    }

    addWitness(n: bigint): StackItem {
        const si = this.stack.newItem(n);
        this.maxStack = Math.max(this.maxStack, this.stack.items.length);
        this.witness.push(n);
        return si;
    }

    hardcode(n: bigint, dataSizeInBytes: number): StackItem {
        return this.newStackItem(n, dataSizeInBytes);
    }

    getTopStackItam(): StackItem {
        return this.stack.items[this.stack.items.length - 1];
    }

    /// NATIVE OPERATIONS ///

    DATA(data: bigint, templateItemId?: string): StackItem {
        if (data >= 0 && data <= 16) {
            this.opcodes.push({ op: hardcode(data), templateItemId });
        } else {
            const dataSizeInBytes = data < 256n ? 1 : data < 512n ? 2 : 4;
            this.opcodes.push({ op: OpcodeType.DATA, data, dataSizeInBytes, templateItemId });
        }
        return this.stack.newItem(data);
    }

    OP_ROLL() {
        this.opcodes.push({ op: OpcodeType.OP_ROLL });
        const si = this.stack.pop();
        this.stack.roll(this.stack.length() - 1 - Number(si.value));
    }

    OP_PICK() {
        this.opcodes.push({ op: OpcodeType.OP_PICK });
        const si = this.stack.pop();
        this.stack.pick(this.stack.length() - 1 - Number(si.value));
    }

    OP_DROP() {
        this.opcodes.push({ op: OpcodeType.OP_DROP });
        this.stack.pop();
    }

    OP_DEPTH() {
        this.opcodes.push({ op: OpcodeType.OP_DEPTH });
        const si = this.stack.newItem(BigInt(this.stack.items.length));
    }

    OP_NIP() {
        this.opcodes.push({ op: OpcodeType.OP_NIP });
        const t1 = this.stack.pop();
        const _ = this.stack.pop();
        this.stack.push(t1);
    }

    OP_IF() {
        const si = this.stack.pop();
        this.opcodes.push({ op: OpcodeType.OP_IF });
    }

    OP_ELSE() {
        this.opcodes.push({ op: OpcodeType.OP_ELSE });
    }

    OP_ENDIF() {
        this.opcodes.push({ op: OpcodeType.OP_ENDIF });
    }

    OP_0_16(n: bigint) {
        if (n < 0 || n > 16) throw new Error('invalid value');
        this.opcodes.push({ op: hardcode(n) });
        this.stack.newItem(n);
    }

    OP_NUMEQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUAL });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value === si2.value ? 1n : 0n);
    }

    OP_EQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_EQUAL });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value === si2.value ? 1n : 0n);
    }

    OP_NOT() {
        this.opcodes.push({ op: OpcodeType.OP_NOT });
        const si = this.stack.pop();
        this.stack.newItem(si.value === 0n ? 1n : 0n);
    }

    OP_DUP() {
        this.opcodes.push({ op: OpcodeType.OP_DUP });
        const si = this.stack.pop();
        this.stack.push(si);
        this.stack.newItem(si.value);
    }

    OP_ADD() {
        this.opcodes.push({ op: OpcodeType.OP_ADD });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value + si2.value);
    }

    OP_1ADD() {
        this.opcodes.push({ op: OpcodeType.OP_1ADD });
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value + 1n);
    }

    OP_SUB() {
        this.opcodes.push({ op: OpcodeType.OP_SUB });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value - si2.value);
    }

    OP_1SUB() {
        this.opcodes.push({ op: OpcodeType.OP_1SUB });
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value - 1n);
    }

    OP_GREATERTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHAN });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value > si2.value ? 1n : 0n);
    }

    OP_GREATERTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value >= si2.value ? 1n : 0n);
    }

    OP_LESSTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHAN });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value < si2.value ? 1n : 0n);
    }

    OP_LESSTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value <= si2.value ? 1n : 0n);
    }

    OP_BOOLOR() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLOR });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value || !!si2.value ? 1n : 0n);
    }

    OP_BOOLAND() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLAND });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value && !!si2.value ? 1n : 0n);
    }

    OP_WITHIN() {
        this.opcodes.push({ op: OpcodeType.OP_WITHIN });
        const x = this.stack.pop().value;
        let min = this.stack.pop().value;
        let max = this.stack.pop().value;
        const t = min;
        min = min < max ? min : max;
        max = t < max ? max : t;
        this.stack.newItem(x >= min && x <= max ? 1n : 0n);
    }

    OP_NUMEQUALVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUALVERIFY });
        const f1 = this.stack.pop().value;
        const f2 = this.stack.pop().value;
        if (f1 != f2) this.fail('OP_NUMEQUALVERIFY');
    }

    OP_TOALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_TOALTSTACK });
        const si = this.stack.pop();
        this.altStack.push(si.value);
    }

    OP_FROMALTSTACK() {
        if (this.altStack.length == 0) this.fail('OP_FROMALTSTACK');
        this.opcodes.push({ op: OpcodeType.OP_FROMALTSTACK });
        this.stack.newItem(this.altStack.pop() ?? 0n);
    }

    OP_SWAP() {
        this.opcodes.push({ op: OpcodeType.OP_SWAP });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        this.stack.items.push(t1);
        this.stack.items.push(t2);
    }

    OP_2DUP() {
        this.opcodes.push({ op: OpcodeType.OP_2DUP });
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);
    }

    OP_3DUP() {
        this.opcodes.push({ op: OpcodeType.OP_3DUP });
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);
        this.stack.newItem(this.stack.top().value);
    }

    OP_TUCK() {
        this.opcodes.push({ op: OpcodeType.OP_TUCK });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        this.stack.items.push(t1);
        this.stack.items.push(t3);
        this.stack.items.push(t2);
    }

    OP_2SWAP() {
        this.opcodes.push({ op: OpcodeType.OP_TUCK });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        const t4 = this.stack.items.pop()!;
        this.stack.items.push(t2);
        this.stack.items.push(t1);
        this.stack.items.push(t4);
        this.stack.items.push(t3);
    }

    OP_ROT() {
        this.opcodes.push({ op: OpcodeType.OP_ROT });
        const t1 = this.stack.items.pop()!;
        const t2 = this.stack.items.pop()!;
        const t3 = this.stack.items.pop()!;
        this.stack.items.push(t2);
        this.stack.items.push(t1);
        this.stack.items.push(t3);
    }

    OP_VERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_VERIFY });
        const t = this.stack.items.pop()!;
        if (!t.value) this.fail('OP_VERIFY');
    }

    OP_SHA256() {
        this.opcodes.push({ op: OpcodeType.OP_SHA256 });
        const t = this.stack.items.pop()!;
        let hex = t.value.toString(16);
        while (hex.length < 64) hex = '0' + hex;
        const h = createHash('sha256').update(hex, 'hex').digest('hex');
        this.stack.newItem(BigInt('0x' + h));
    }

    OP_HASH160() {
        this.opcodes.push({ op: OpcodeType.OP_HASH160 });
        const t = this.stack.items.pop()!;
        let hex = t.value.toString(16);
        while (hex.length < 40) hex = '0' + hex;
        const h1 = createHash('sha256').update(hex, 'hex').digest();
        const h2 = createHash('ripemd160').update(h1).digest('hex');
        this.stack.newItem(BigInt('0x' + h2));
    }

    OP_CHECKSIGVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_CHECKSIGVERIFY });
        this.stack.items.pop()!;
        this.stack.items.pop()!;
    }

    OP_CHECKSEQUENCEVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_CHECKSEQUENCEVERIFY });
    }

    /// Complex operations ///

    roll(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) return;
        if (rel < 256) this.newStackItem(BigInt(rel), 1);
        else if (rel < 512) this.newStackItem(BigInt(rel), 2);
        else this.newStackItem(BigInt(rel), 4);
        this.OP_ROLL();
    }

    pick(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) {
            this.OP_DUP();
        } else {
            this.DATA(BigInt(rel));
            this.OP_PICK();
        }
    }

    drop(si: StackItem | StackItem[]) {
        if (Array.isArray(si)) {
            si = si.sort((a, b) => this.getRelativeStackPosition(a) - this.getRelativeStackPosition(b));
            si.forEach(tsi => this.drop(tsi));
        } else {
            const rel = this.getRelativeStackPosition(si);
            if (rel == 0) {
                this.OP_DROP();
            } else if (rel == 1) {
                this.OP_NIP();
            } else {
                this.roll(si);
                this.OP_DROP();
            }
        }
    }

    replaceWithTop(si: StackItem) {
        this.drop(si);
        const tsi = this.stack.pop();
        si.value = tsi.value;
        this.stack.push(si);
    }

    public tableFetch(target: StackItem, firstItem: StackItem, index: StackItem) {
        const rel = this.getRelativeStackPosition(firstItem);
        this.DATA(BigInt(rel));
        this.pick(index);
        this.OP_SUB();
        this.OP_PICK();
        this.replaceWithTop(target);
    }

    public tableFetchInStack(table: StackItem[]) {
        if (this.stack.items[this.stack.items.length - 1].value > table.length)
            throw new Error('Table overflow: ' + this.stack.items[this.stack.items.length - 1].value);
        const rel = this.getRelativeStackPosition(table[0]) - 1;
        const dataSize = rel < 256 ? 1 : rel < 512 ? 2 : 4;
        this.DATA(BigInt(rel));
        this.OP_SWAP();
        this.OP_SUB();
        this.OP_PICK();
    }

    xor(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.OP_0_16(1n);
        this.OP_NUMEQUAL();
        this.replaceWithTop(target);
    }

    and(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_BOOLAND();
        this.replaceWithTop(target);
    }

    or(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_BOOLOR();
        this.replaceWithTop(target);
    }

    equal(si: StackItem, a: StackItem, n: bigint) {
        this.OP_0_16(n);
        this.pick(a);
        this.OP_NUMEQUAL();
        this.replaceWithTop(si);
    }

    equals(si: StackItem, si1: StackItem, si2: StackItem) {
        this.pick(si1);
        this.pick(si2);
        this.OP_NUMEQUAL();
        this.replaceWithTop(si);
    }

    equalNibbles(target: StackItem, a: StackItem[], b: StackItem[]) {
        const l = Math.max(a.length, b.length);
        this.OP_0_16(0n);
        for (let i = 0; i < l; i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_NUMEQUAL();
            this.OP_ADD();
        }
        this.DATA(BigInt(l));
        this.OP_NUMEQUAL()
        this.replaceWithTop(target);
    }

    setBit_1(target: StackItem) {
        this.OP_0_16(1n);
        this.replaceWithTop(target);
    }

    setBit_0(target: StackItem) {
        this.OP_0_16(0n);
        this.replaceWithTop(target);
    }

    mov(target: StackItem, source: StackItem) {
        this.pick(source);
        this.replaceWithTop(target);
    }

    not(target: StackItem, a: StackItem) {
        this.pick(a);
        this.OP_NOT();
        this.replaceWithTop(target);
    }

    add(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.replaceWithTop(target);
    }

    addOne(target: StackItem, a: StackItem) {
        this.pick(a);
        this.OP_0_16(1n);
        this.OP_ADD();
        this.replaceWithTop(target);
    }

    assertZero(a: StackItem) {
        this.pick(a);
        this.OP_0_16(0n);
        this.OP_NUMEQUALVERIFY()
    }

    assertOne(a: StackItem) {
        this.pick(a);
        this.OP_0_16(1n);
        this.OP_NUMEQUALVERIFY()
    }

    assertEqual(a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_NUMEQUALVERIFY()
    }

    setIfElse(target: StackItem, v: StackItem, t: StackItem, f: StackItem) {
        const temp = v.value ? t.value : f.value;
        this.pick(v);
        this.OP_IF();
        this.pick(t);
        this.replaceWithTop(target);
        this.OP_ELSE();
        this.pick(f);
        this.replaceWithTop(target);
        this.OP_ENDIF();
        // correct if weirdness
        target.value = temp;
    }

    /********* helpers *********/

    private addBit(target: StackItem, carry: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.pick(carry);
        this.OP_ADD();
        this.replaceWithTop(target);
        this.pick(target);
        this.OP_0_16(2n);
        this.OP_GREATERTHANOREQUAL();
        this.replaceWithTop(carry);
        this.pick(carry)
        this.OP_IF();
        this.pick(target);
        this.OP_0_16(2n);
        this.OP_SUB();
        this.replaceWithTop(target);
        this.OP_ENDIF();

        // correct for if weirdness
        if (target.value < 0) target.value += 2n;
    }

    equalMany(target: StackItem, a: StackItem[], b: StackItem[]) {
        this.OP_0_16(1n);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_NUMEQUAL();
            this.OP_BOOLAND();
        }
        this.replaceWithTop(target);
    }

    verifyEqualMany(a: StackItem[], b: StackItem[]) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_NUMEQUAL();
            this.OP_NOT();
            this.OP_VERIFY();
        }
    }

    verifyNotEqualMany(a: StackItem[], b: StackItem[]) {

        if (a.length != b.length) throw new Error('Wrong length');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            this.OP_NUMEQUAL();
            this.OP_NOT();
            this.OP_VERIFY();
        }
    }

    checkUpperZero(a: SimulatedRegister) {
        for (let i = 1; i < 8; i++) {
            this.assertZero(a.stackItems[i]);
        }
    }

    nibbleToBits3(bits: StackItem[], nibble: StackItem) {
        for (let i = 0; i < 8; i++) {
            this.OP_0_16(BigInt(i));
            this.pick(nibble);
            this.OP_NUMEQUAL();
            const flag = this.getTopStackItam().value == 1n;
            const saved = [bits[0].value, bits[1].value, bits[2]?.value];
            this.OP_IF();
            this.OP_0_16(BigInt(i & 1));
            this.replaceWithTop(bits[0]);
            this.OP_0_16(BigInt(i & 2));
            this.replaceWithTop(bits[1]);
            if (bits[2]) {
                this.OP_0_16(BigInt(i & 4));
                this.replaceWithTop(bits[2]);
            }
            this.OP_ENDIF();
            if (!flag) {
                bits[0].value = saved[0];
                bits[1].value = saved[1];
                if (bits[2]) bits[2].value = saved[2];
            }
        }
    }

    nibblesToRegister32(register: SimulatedRegister, nibbles: StackItem[]) {
        for (let i = 0; i < 11; i++) {
            this.nibbleToBits3(
                [
                    register.stackItems[i * 3],
                    register.stackItems[i * 3 + 1],
                    register.stackItems[i * 3 + 2]
                ],
                nibbles[i]);
        }
    }

    /********* step 1 *********/

    assertZeroMany(si: StackItem[]) {
        for (let i = 0; i < si.length; i++) {
            this.assertZero(si[i]);
        }
    }

    assertEqualMany(a: StackItem[], b: StackItem[], c: StackItem[]) {

        this.assertZeroMany(c.slice(1));

        this.OP_0_16(1n);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_NUMEQUAL();
            this.OP_BOOLAND();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertOrMany(a: StackItem[], b: StackItem[], c: StackItem[]) {

        this.assertZeroMany(c.slice(1));

        this.OP_0_16(0n);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_BOOLOR();
            this.OP_BOOLOR();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertAndMany(a: StackItem[], b: StackItem[], c: StackItem[]) {

        this.assertZeroMany(c.slice(1));

        this.OP_0_16(1n);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0n);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0n);
            this.OP_BOOLAND();
            this.OP_BOOLAND();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertNotMany(a: StackItem[], c: StackItem[]) {

        this.assertZeroMany(c.slice(1));

        this.OP_0_16(0n);
        for (let i = 0; i < a.length; i++) {
            this.pick(a[i]);
            this.OP_BOOLOR();
        }

        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertOneMany(a: StackItem[]) {

        this.assertZeroMany(a.slice(1));
        this.pick(a[0]);
        this.OP_0_16(1n);
        this.OP_NUMEQUALVERIFY();
    }

    /***  Witness decoding ***/

    winternitzDecodeNibble(target: StackItem, witness: StackItem, publicKey: bigint) {
        const pk = this.hardcode(publicKey, 20);
        this.pick(witness); // witness
        for (let i = 0; i < 8; i++) {
            this.OP_HASH160(); // hash
            this.OP_DUP(); // hash hash
            this.pick(pk); // hash hash pk
            this.OP_EQUAL(); // hash 0/1

            // hack
            const flag = this.stack.items[this.stack.items.length - 1].value;

            this.OP_IF(); // hash
            this.DATA(BigInt(i)); // hash i
            this.OP_TOALTSTACK(); // hash
            this.OP_ENDIF(); // hash

            // hack
            if (!flag) this.altStack.pop();
        }
        this.OP_DROP(); //
        this.OP_FROMALTSTACK(); // i
        this.replaceWithTop(target); //
        this.drop(pk);
    }

    winternitzCheck1(witness: StackItem[], publicKeys: bigint[]) {
        if (witness.length != 2 || publicKeys.length != 2) throw new Error('Invalid length');
        const data = this.newStackItem();
        const checksum = this.newStackItem();
        this.winternitzDecodeNibble(data, witness[0], publicKeys[0]);
        this.winternitzDecodeNibble(checksum, witness[1], publicKeys[1]);

        this.DATA(7n);
        this.pick(checksum);
        this.OP_SUB();

        this.pick(data);
        this.OP_NUMEQUALVERIFY();

        this.drop(checksum);
        this.drop(data);
    }

    winternitzDecode1(target: StackItem, witness: StackItem[], publicKeys: bigint[]) {
        if (witness.length != 2 || publicKeys.length != 2) throw new Error('Invalid length');
        const checksum = this.newStackItem();
        this.winternitzDecodeNibble(target, witness[0], publicKeys[0]);
        this.winternitzDecodeNibble(checksum, witness[1], publicKeys[1]);

        this.DATA(7n);
        this.pick(checksum);
        this.OP_SUB();

        this.pick(target);
        this.OP_NUMEQUALVERIFY();
        this.drop(checksum);
    }

    checkPrehash(target: StackItem, prehash: StackItem, hash: bigint) {
        this.pick(prehash);
        this.OP_HASH160();
        this.DATA(hash);
        this.OP_EQUAL();
        this.replaceWithTop(target);
    }

    lamportDecodeBit(target: StackItem, witness: StackItem, publicKeys: bigint[]) {
        const temp = this.newStackItem(0n);
        this.setBit_0(target);
        this.checkPrehash(temp, witness, publicKeys[0]);
        this.checkPrehash(target, witness, publicKeys[1]);
        this.pick(temp);
        this.pick(target);
        this.OP_BOOLOR();
        this.OP_VERIFY();
        this.drop(temp);
    }

    lamportDecode(targets: StackItem[], witness: StackItem[], publicKeys: bigint[][]) {
        for (let i = 0; i < witness.length; i++) {
            this.lamportDecodeBit(targets[i], witness[i], publicKeys[i]);
        }
    }

    lamportEquivocation(witness: StackItem[], publicKeys: bigint[]) {
        const agg = this.newStackItem(0n);
        const temp = this.newStackItem(0n);
        this.checkPrehash(agg, witness[0], publicKeys[0]);
        this.checkPrehash(temp, witness[0], publicKeys[1]);
        this.add(agg, agg, temp);
        this.checkPrehash(temp, witness[1], publicKeys[0]);
        this.add(agg, agg, temp);
        this.checkPrehash(temp, witness[1], publicKeys[1]);
        this.add(agg, agg, temp);
        this.pick(agg);
        this.OP_0_16(2n);
        this.OP_GREATERTHANOREQUAL();
        this.OP_VERIFY();
        this.drop(agg);
        this.drop(temp);
    }

    winternitzCheck32(witness: StackItem[], publicKeys: bigint[]) {

        const checksum = this.newStackItem(0n);
        const temp = this.newStackItem(0n);
        const checksumNibbles: StackItem[] = this.newNibbles(3);

        for (let i = 0; i < 11; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 3; i++) {
            this.winternitzDecodeNibble(checksumNibbles[i], witness[11 + i], publicKeys[11 + i]);
        }

        this.DATA(7n);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(temp);
        this.drop(checksumNibbles);
    }

    winternitzDecode32(target: StackItem[], witness: StackItem[], publicKeys: bigint[]) {

        const totalNibbles = 14;
        const checksum = this.newStackItem(0n);

        for (let i = 0; i < totalNibbles; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
        }

        for (let i = 0; i < totalNibbles - 3; i++) {
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        this.DATA(7n);
        this.pick(target[totalNibbles - 1]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(target[totalNibbles - 2]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(target[totalNibbles - 3]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
    }

    winternitzEquivocation32(target: StackItem[], witnessA: StackItem[], witnessB: StackItem[], publicKeys: bigint[]) {
        //devide the witness in two 14 items arrays
        this.verifyNotEqualMany(witnessA, witnessB);
        this.winternitzDecode32(target, witnessA, publicKeys);
        this.winternitzDecode32(target, witnessB, publicKeys);
    }

    winternitzEquivocation256(target: StackItem[], witnessA: StackItem[], witnessB: StackItem[], publicKeys: bigint[]) {
        //devide the witness in two 14 items arrays
        this.verifyNotEqualMany(witnessA, witnessB);
        this.winternitzDecode256(target, witnessA, publicKeys);
        this.winternitzDecode256(target, witnessB, publicKeys);
    }

    winternitzCheck24(witness: StackItem[], publicKeys: bigint[]) {
        const totalNibbles = 10;
        const temp = this.newStackItem(0n);
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 2; i++) checksumNibbles.push(this.newStackItem(0n));
        const checksum = this.newStackItem(0n);

        for (let i = 0; i < totalNibbles - 2; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 2; i++) {
            this.winternitzDecodeNibble(checksumNibbles[i], witness[totalNibbles - 2 + i], publicKeys[totalNibbles - 2 + i]);
        }

        this.DATA(7n);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(temp);
        this.drop(checksumNibbles);
    }

    winternitzDecode24(target: StackItem[], witness: StackItem[], publicKeys: bigint[]) {
        const totalNibbles = 10;
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 2; i++) checksumNibbles.push(this.newStackItem(0n));
        const checksum = this.newStackItem(0n);

        for (let i = 0; i < totalNibbles - 2; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 2; i++) {
            this.winternitzDecodeNibble(checksumNibbles[i], witness[totalNibbles - 2 + i], publicKeys[totalNibbles - 2 + i]);
        }

        this.DATA(7n);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(checksumNibbles);
    }

    winternitzCheck256(witness: StackItem[], publicKeys: bigint[]) {
        const totalNibbles = 90;
        const temp = this.newStackItem(0n);
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 4; i++) checksumNibbles.push(this.newStackItem(0n));
        const checksum = this.newStackItem(0n);

        for (let i = 0; i < totalNibbles - 4; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 4; i++) {
            this.winternitzDecodeNibble(checksumNibbles[i], witness[totalNibbles - 4 + i], publicKeys[totalNibbles - 4 + i]);
        }

        this.DATA(7n);
        this.pick(checksumNibbles[3]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(temp);
        this.drop(checksumNibbles);
    }

    winternitzDecode256(target: StackItem[], witness: StackItem[], publicKeys: bigint[]) {

        const totalNibbles = 90;
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 4; i++) checksumNibbles.push(this.newStackItem(0n));
        const checksum = this.newStackItem(0n);

        for (let i = 0; i < totalNibbles - 4; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 4; i++) {
            this.winternitzDecodeNibble(checksumNibbles[i], witness[totalNibbles - 4 + i], publicKeys[totalNibbles - 4 + i]);
        }

        this.DATA(7n);
        this.pick(checksumNibbles[3]);
        this.OP_SUB();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        // * 8
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();
        this.OP_DUP();
        this.OP_ADD();

        this.DATA(7n);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(checksumNibbles);
    }

    checkInitialTransaction(witness: StackItem[], publicKeys: bigint[]) {
        for (let i = 0; i < 10; i++) {
            this.winternitzCheck256(witness.slice(i * 90, i * 90 + 90), publicKeys.slice(i * 90, i * 90 + 90));
        }
    }

    checkTransitionPatTransaction(witness: StackItem[], publicKeys: bigint[]) {
        for (let i = 0; i < 3; i++) {
            this.winternitzCheck256(witness.slice(i * 90, i * 90 + 90), publicKeys.slice(i * 90, i * 90 + 90));
        }
    }

    checkTransitionVicTransaction(witness: StackItem[], publicKeys: bigint[][]) {
        const temp = this.newStackItem(0n);
        this.lamportDecodeBit(temp, witness[0], publicKeys[0]);
        this.lamportDecodeBit(temp, witness[1], publicKeys[1]);
    }

    checkStep2State(witness: StackItem[], publicKeys: bigint[]) {
        for (let i = 0; i < witness.length / 14; i++) {
            this.winternitzCheck32(witness.slice(i * 14, i * 14 + 14), publicKeys.slice(i * 14, i * 14 + 14));
        }
    }

    verifySearchPath(searchPathWitness: StackItem[], searchPath: number[], publicKeys: bigint[][]) {
        const temp = this.newStackItem();
        if (searchPathWitness.length != searchPath.length) throw new Error('Wrong lengths');
        for (let i = 0; i < searchPathWitness.length; i++) {
            this.lamportDecodeBit(temp, searchPathWitness[i], publicKeys[i]);
            if (searchPath[i] == 1) this.assertOne(temp);
            else this.assertZero(temp);
        }
    }

    verifySignature(publicKey: bigint) {
        this.addWitness(0n);
        this.DATA(publicKey);
        this.OP_CHECKSIGVERIFY();
    }

    checkTimeout(blocks: number) {
        this.DATA(BigInt(blocks));
        this.OP_CHECKSEQUENCEVERIFY();
        this.OP_DROP();
    }

    checkSemiFinal(pathNibbles: StackItem[], indexNibbles: StackItem[], iterations: number) {

        // compare them one nibble at a time
        const temp = this.newStackItem();
        for (let i = 0; i < Math.ceil(iterations / 3); i++) {

            // start with zero
            this.OP_0_16(0n);
            this.replaceWithTop(temp);

            for (let j = 0; j < 3; j++) {

                if (j > 0) {
                    // temp = temp * 2;
                    this.pick(temp);
                    this.OP_DUP();
                    this.OP_ADD();
                    this.replaceWithTop(temp);
                }

                // pick bit
                if (pathNibbles[i * 3 + j]) this.pick(pathNibbles[i * 3 + j]);
                else this.OP_0_16(0n);
                this.OP_IF();
                this.OP_0_16(1n);
                this.OP_ELSE();
                this.OP_0_16(0n);
                this.OP_ENDIF();

                // hack
                this.stack.items.pop();

                // add bit to temp
                this.pick(temp);
                this.OP_ADD();
                this.replaceWithTop(temp);
            }

            // check equality
            this.assertEqual(temp, indexNibbles[i]);
        }
    }

    verifyIndex(keys: bigint[], indexWitness: StackItem[], indexNibbles: number[]) {

        const tempIndex = this.newNibbles(90);
        this.winternitzDecode256(tempIndex, indexWitness, keys);
        for (let i = 0; i < indexNibbles.length; i++) {
            this.DATA(BigInt(indexNibbles[i]), `indexNibbles_${i}`);
            this.pick(tempIndex[i]);
            this.OP_NUMEQUALVERIFY();
        }
        this.drop(tempIndex);
    }

    /***  META ***/

    programSizeInBitcoinBytes(): number {
        let total = 0;
        this.opcodes.forEach(op => {
            if (op.data) {
                let n = op.data ?? 0n;
                let log = 0;
                for (; n > 0; log++) n = n >> 1n;
                total += 1 + Math.ceil(log / 8);
            } else {
                total++;
            }
        });
        return total;
    }

    private verifyEndsWithOP_1() {
        if (this.opcodes.length == 0 || this.opcodes[this.opcodes.length - 1].op != OpcodeType.OP_1) {
            this.opcodes.push({ op: OpcodeType.OP_1 });
        }
    }

    programToString(trimStack?: boolean): string {

        // program has to end with 1 on the stack
        if (trimStack ?? true) this.verifyEndsWithOP_1();

        let s = '';
        this.opcodes.forEach(op => {
            if (op.data) {
                s += `<0x${op.data.toString(16)}>\n`;
            } else {
                s += `${op.op}\n`;
            }
        });
        return s;
    }

    programToBinary(trimStack?: boolean): Buffer {

        // program has to end with 1 on the stack
        if (trimStack ?? true) this.verifyEndsWithOP_1();

        const byteArray: number[] = [];
        this.opcodes.forEach(opcode => {
            if (opcode.op == OpcodeType.DATA) {
                byteArray.push(opcode.dataSizeInBytes!);
                byteArray.push(...Buffer.from(padHex(opcode.data!.toString(16), opcode.dataSizeInBytes!), 'hex'));
            } else {
                byteArray.push(opcodeValues[opcode.op!]);
            }
        });
        return Buffer.from(byteArray);
    }

    programToTemplate(trimStack?: boolean): Template {

        const items: { itemId: string, index: number, sizeInBytes: number }[] = [];

        // program has to end with 1 on the stack
        if (trimStack ?? true) this.verifyEndsWithOP_1();

        const byteArray: number[] = [];
        this.opcodes.forEach(opcode => {
            if (opcode.op == OpcodeType.DATA) {
                byteArray.push(opcode.dataSizeInBytes!);
                if (opcode.templateItemId && opcode.dataSizeInBytes) {
                    items.push({ itemId: opcode.templateItemId, sizeInBytes: opcode.dataSizeInBytes, index: byteArray.length });
                }
                byteArray.push(...Buffer.from(padHex(opcode.data!.toString(16), opcode.dataSizeInBytes!), 'hex'));
            } else {
                byteArray.push(opcodeValues[opcode.op!]);
            }
        });

        return { buffer: Buffer.from(byteArray), items };
    }
}
