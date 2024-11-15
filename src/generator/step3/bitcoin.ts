import * as bitcoinjs from 'bitcoinjs-lib';
import { hardcode, opcodeMap, OpcodeType, opcodeValues } from './bitcoin-opcodes';
import { StackItem, Stack } from './stack';
import { createHash } from 'crypto';

interface Operation {
    op?: OpcodeType;
    data?: number | Buffer;
    templateItemId?: string;
}

export interface Template {
    buffer: Buffer;
    items: { itemId: string; index: number }[];
}

export interface ProgramToTemplateOpts {
    validateStack?: boolean;
}

export class Bitcoin {
    opcodes: Operation[] = [];
    stack: Stack = new Stack();
    altStack: (number | Buffer)[] = [];
    witness: (number | Buffer)[] = [];
    hardcoded: (number | Buffer)[] = [];
    success = true;
    public maxStack = 0;
    public throwOnFail = false;

    constructor() {}

    reset() {
        this.opcodes = [];
        this.stack = new Stack();
        this.success = true;
    }

    fail(msg?: string) {
        this.success = false;
        if (this.throwOnFail) throw new Error('Failed: ' + msg);
    }

    /// BASIC ///

    newStackItem(value: number | Buffer): StackItem {
        if (typeof value == 'number' && (value < 0 || value > 65535)) throw new Error('Invalid value');
        const si = this.DATA(value);
        this.maxStack = Math.max(this.maxStack, this.stack.items.length);
        // console.log('Stack: ', this.stack.items.length);
        if (this.throwOnFail) {
            if (this.stack.items.length + this.altStack.length > 1000)
                throw new Error(`Stack too big: ${this.stack.items.length + this.altStack.length}`);
        }
        return si;
    }

    newNibbles32(): StackItem[] {
        return this.newNibbles(14);
    }

    newNibbles(count: number): StackItem[] {
        return new Array(count).fill(0).map(() => this.newStackItem(0));
    }

    newNibblesFast(count: number): StackItem[] {
        if (count < 4) throw new Error('Use only for count > 4');

        let n = count;

        this.DATA(0); // 1
        this.DATA(0); // 2
        this.OP_2DUP(); // 4
        n -= 4;

        while (n >= 3) {
            this.OP_3DUP();
            n -= 3;
        }
        while (n > 2) {
            this.OP_2DUP();
            n -= 2;
        }
        while (n > 0) {
            this.OP_DUP();
            n--;
        }

        return this.stack.items.slice(this.stack.items.length - count);
    }

    private getRelativeStackPosition(si: StackItem): number {
        const index = this.stack.findIndex(si);
        if (index < 0) throw new Error('Invalid relative position');
        return this.stack.length() - index - 1;
    }

    addWitness(n: number | Buffer): StackItem {
        const si = this.stack.newItem(n);
        this.maxStack = Math.max(this.maxStack, this.stack.items.length);
        this.witness.push(n);
        return si;
    }

    hardcode(n: number | Buffer): StackItem {
        return this.newStackItem(n);
    }

    getTopStackItam(): StackItem {
        return this.stack.items[this.stack.items.length - 1];
    }

    popNumber(): number {
        const n = this.stack.pop().value;
        if (typeof n != 'number') throw new Error('Not a number');
        return n as number;
    }

    /// NATIVE OPERATIONS ///

    DATA(data: number | Buffer, templateItemId?: string): StackItem {
        if (typeof data == 'number' && (data < 0 || data > 2 ** 16 - 1)) throw new Error('Invalid number');
        this.opcodes.push({ op: OpcodeType.DATA, data, templateItemId });
        return this.stack.newItem(data);
    }

    OP_ROLL() {
        this.opcodes.push({ op: OpcodeType.OP_ROLL });
        const n = this.popNumber();
        this.stack.roll(this.stack.length() - 1 - n);
    }

    OP_PICK() {
        this.opcodes.push({ op: OpcodeType.OP_PICK });
        const n = this.popNumber();
        this.stack.pick(this.stack.length() - 1 - n);
    }

    OP_DROP() {
        this.opcodes.push({ op: OpcodeType.OP_DROP });
        this.stack.pop();
    }

    OP_DEPTH() {
        this.opcodes.push({ op: OpcodeType.OP_DEPTH });
        this.stack.newItem(this.stack.items.length);
    }

    OP_NIP() {
        this.opcodes.push({ op: OpcodeType.OP_NIP });
        const t1 = this.stack.pop();
        this.stack.pop();
        this.stack.push(t1);
    }

    OP_IF() {
        this.stack.pop();
        this.opcodes.push({ op: OpcodeType.OP_IF });
    }

    OP_ELSE() {
        this.opcodes.push({ op: OpcodeType.OP_ELSE });
    }

    OP_ENDIF() {
        this.opcodes.push({ op: OpcodeType.OP_ENDIF });
    }

    OP_0_16(n: number) {
        if (n < 0 || n > 16) throw new Error('invalid value');
        this.opcodes.push({ op: hardcode(n) });
        this.stack.newItem(n);
    }

    OP_NUMEQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUAL });
        const n1 = this.popNumber();
        const n2 = this.popNumber();
        this.stack.newItem(n1 === n2 ? 1 : 0);
    }

    OP_EQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_EQUAL });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        if (typeof si1.value != typeof si2.value) {
            this.stack.newItem(0);
        } else if (typeof si1.value == 'number') {
            this.stack.newItem(si1.value === si2.value ? 1 : 0);
        } else {
            this.stack.newItem(si1.value.compare(si2.value as Buffer) == 0 ? 1 : 0);
        }
    }

    OP_NOT() {
        this.opcodes.push({ op: OpcodeType.OP_NOT });
        const n1 = this.popNumber();
        this.stack.newItem(n1 === 0 ? 1 : 0);
    }

    OP_DUP() {
        this.opcodes.push({ op: OpcodeType.OP_DUP });
        const si = this.stack.pop();
        this.stack.push(si);
        this.stack.newItem(si.value);
    }

    OP_ADD() {
        this.opcodes.push({ op: OpcodeType.OP_ADD });
        const n1 = this.popNumber();
        const n2 = this.popNumber();
        this.stack.newItem(n1 + n2);
    }

    OP_1ADD() {
        this.opcodes.push({ op: OpcodeType.OP_1ADD });
        const n1 = this.popNumber();
        this.stack.newItem(n1 + 1);
    }

    OP_SUB() {
        this.opcodes.push({ op: OpcodeType.OP_SUB });
        const n2 = this.popNumber();
        const n1 = this.popNumber();
        this.stack.newItem(n1 - n2);
    }

    OP_1SUB() {
        this.opcodes.push({ op: OpcodeType.OP_1SUB });
        const n1 = this.popNumber();
        this.stack.newItem(n1 - 1);
    }

    OP_GREATERTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHAN });
        const n2 = this.popNumber();
        const n1 = this.popNumber();
        this.stack.newItem(n2 > n1 ? 1 : 0);
    }

    OP_GREATERTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHANOREQUAL });
        const n2 = this.popNumber();
        const n1 = this.popNumber();
        this.stack.newItem(n1 >= n2 ? 1 : 0);
    }

    OP_LESSTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHAN });
        const n2 = this.popNumber();
        const n1 = this.popNumber();
        this.stack.newItem(n1 < n2 ? 1 : 0);
    }

    OP_LESSTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHANOREQUAL });
        const n2 = this.popNumber();
        const n1 = this.popNumber();
        this.stack.newItem(n1 <= n2 ? 1 : 0);
    }

    OP_BOOLOR() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLOR });
        const n1 = this.popNumber();
        const n2 = this.popNumber();
        this.stack.newItem(!!n1 || !!n2 ? 1 : 0);
    }

    OP_BOOLAND() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLAND });
        const n1 = this.popNumber();
        const n2 = this.popNumber();
        this.stack.newItem(!!n1 && !!n2 ? 1 : 0);
    }

    OP_WITHIN() {
        this.opcodes.push({ op: OpcodeType.OP_WITHIN });
        const x = this.popNumber();
        let min = this.popNumber();
        let max = this.popNumber();
        const t = min;
        min = min < max ? min : max;
        max = t < max ? max : t;
        this.stack.newItem(x >= min && x <= max ? 1 : 0);
    }

    OP_NUMEQUALVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUALVERIFY });
        const f1 = this.popNumber();
        const f2 = this.popNumber();
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
        this.stack.newItem(this.altStack.pop() ?? 0);
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
        const si = this.stack.items.pop()!;
        if (si.value instanceof Buffer) {
            const h = createHash('sha256')
                .update(si.value as Buffer)
                .digest();
            this.stack.newItem(h);
        } else {
            throw new Error('Expecting a buffer');
        }
    }

    OP_HASH160() {
        this.opcodes.push({ op: OpcodeType.OP_HASH160 });
        const si = this.stack.items.pop()!;
        if (si.value instanceof Buffer) {
            const h1 = createHash('sha256')
                .update(si.value as Buffer)
                .digest();
            const h2 = createHash('ripemd160').update(h1).digest();
            this.stack.newItem(h2);
        } else {
            throw new Error('Expecting a buffer');
        }
    }

    OP_CHECKSIGVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_CHECKSIGVERIFY });
        this.stack.items.pop()!;
        this.stack.items.pop()!;
    }

    OP_CHECKSEQUENCEVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_CHECKSEQUENCEVERIFY });
    }

    // on-stack operations

    mul(n: number) {
        if (n < 2 || n > 256) throw new Error('n should be between 2 and 256');

        // get bits
        const bits = n.toString(2);
        // make sure we have <bits> copies of the value
        for (let i = 0; i < bits.length - 1; i++) {
            this.OP_DUP();
        }
        // take each one, multiply it by power of 2, and push to altstack
        let counter = 0;
        for (let i = 0; i < bits.length; i++) {
            if (bits[i] == '1') {
                for (let j = bits.length - i; j > 1; j--) {
                    this.OP_DUP();
                    this.OP_ADD();
                }
                this.OP_TOALTSTACK();
                counter++;
            } else {
                this.OP_DROP();
            }
        }
        // add them all up!
        for (let i = 0; i < counter; i++) {
            this.OP_FROMALTSTACK();
            if (i > 0) this.OP_ADD();
        }
    }

    /// Complex operations ///

    roll(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) return;
        this.newStackItem(rel);
        this.OP_ROLL();
    }

    pick(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) {
            this.OP_DUP();
        } else {
            this.DATA(rel);
            this.OP_PICK();
        }
    }

    drop(si: StackItem | StackItem[]) {
        if (Array.isArray(si)) {
            si = si.sort((a, b) => this.getRelativeStackPosition(a) - this.getRelativeStackPosition(b));
            si.forEach((tsi) => this.drop(tsi));
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
        this.DATA(rel);
        this.pick(index);
        this.OP_SUB();
        this.OP_PICK();
        this.replaceWithTop(target);
    }

    public tableFetchInStack(table: StackItem[]) {
        if ((this.stack.top().value as number) > table.length)
            throw new Error('Table overflow: ' + this.stack.items[this.stack.items.length - 1].value);
        const rel = this.getRelativeStackPosition(table[0]) - 1;
        this.DATA(rel);
        this.OP_SWAP();
        this.OP_SUB();
        this.OP_PICK();
    }

    xor(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.OP_0_16(1);
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

    equal(si: StackItem, a: StackItem, n: number) {
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
        this.OP_0_16(0);
        for (let i = 0; i < l; i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_NUMEQUAL();
            this.OP_ADD();
        }
        this.DATA(l);
        this.OP_NUMEQUAL();
        this.replaceWithTop(target);
    }

    setBit_1(target: StackItem) {
        this.OP_0_16(1);
        this.replaceWithTop(target);
    }

    setBit_0(target: StackItem) {
        this.OP_0_16(0);
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
        this.OP_0_16(1);
        this.OP_ADD();
        this.replaceWithTop(target);
    }

    assertZero(a: StackItem) {
        this.pick(a);
        this.OP_0_16(0);
        this.OP_NUMEQUALVERIFY();
    }

    assertOne(a: StackItem) {
        this.pick(a);
        this.OP_0_16(1);
        this.OP_NUMEQUALVERIFY();
    }

    assertEqual(a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_NUMEQUALVERIFY();
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

    equalMany(target: StackItem, a: StackItem[], b: StackItem[]) {
        this.OP_0_16(1);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_NUMEQUAL();
            this.OP_BOOLAND();
        }
        this.replaceWithTop(target);
    }

    verifyEqualMany(a: StackItem[], b: StackItem[]) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_NUMEQUAL();
            this.OP_NOT();
            this.OP_VERIFY();
        }
    }

    verifyNotEqualMany(a: StackItem[], b: StackItem[]) {
        if (a.length != b.length) throw new Error('Wrong length');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            this.OP_NUMEQUAL();
            this.OP_NOT();
            this.OP_VERIFY();
        }
    }

    nibbleToBits3(bits: StackItem[], nibble: StackItem) {
        for (let i = 0; i < 8; i++) {
            this.OP_0_16(i);
            this.pick(nibble);
            this.OP_NUMEQUAL();
            const flag = this.getTopStackItam().value === 1;
            const saved = [bits[0].value, bits[1].value, bits[2]?.value];
            this.OP_IF();
            this.OP_0_16(i & 1);
            this.replaceWithTop(bits[0]);
            this.OP_0_16(i & 2);
            this.replaceWithTop(bits[1]);
            if (bits[2]) {
                this.OP_0_16(i & 4);
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

    /********* step 1 *********/

    assertZeroMany(si: StackItem[]) {
        for (let i = 0; i < si.length; i++) {
            this.assertZero(si[i]);
        }
    }

    assertEqualMany(a: StackItem[], b: StackItem[], c: StackItem[]) {
        this.assertZeroMany(c.slice(1));

        this.OP_0_16(1);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_NUMEQUAL();
            this.OP_BOOLAND();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertOrMany(a: StackItem[], b: StackItem[], c: StackItem[]) {
        this.assertZeroMany(c.slice(1));

        this.OP_0_16(0);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_BOOLOR();
            this.OP_BOOLOR();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertAndMany(a: StackItem[], b: StackItem[], c: StackItem[]) {
        this.assertZeroMany(c.slice(1));

        this.OP_0_16(1);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if (a[i]) this.pick(a[i]);
            else this.OP_0_16(0);
            if (b[i]) this.pick(b[i]);
            else this.OP_0_16(0);
            this.OP_BOOLAND();
            this.OP_BOOLAND();
        }
        this.pick(c[0]);
        this.OP_NUMEQUALVERIFY();
    }

    assertNotMany(a: StackItem[], c: StackItem[]) {
        this.assertZeroMany(c.slice(1));

        this.OP_0_16(0);
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
        this.OP_0_16(1);
        this.OP_NUMEQUALVERIFY();
    }

    /***  Witness decoding ***/

    winternitzDecodeNibble(target: StackItem, witness: StackItem, publicKey: Buffer) {
        const pk = this.hardcode(publicKey);
        this.pick(witness); // witness
        for (let i = 0; i < 8; i++) {
            this.OP_HASH160(); // hash
            this.OP_DUP(); // hash hash
            this.pick(pk); // hash hash pk
            this.OP_EQUAL(); // hash 0/1

            // hack
            const flag = this.stack.items[this.stack.items.length - 1].value;

            this.OP_IF(); // hash
            this.DATA(i); // hash i
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

    winternitzCheck1(witness: StackItem[], publicKeys: Buffer[]) {
        if (witness.length != 2 || publicKeys.length != 2) throw new Error('Invalid length');
        const data = this.newStackItem(0);
        const checksum = this.newStackItem(0);
        this.winternitzDecodeNibble(data, witness[0], publicKeys[0]);
        this.winternitzDecodeNibble(checksum, witness[1], publicKeys[1]);

        this.DATA(7);
        this.pick(checksum);
        this.OP_SUB();

        this.pick(data);
        this.OP_NUMEQUALVERIFY();

        this.drop(checksum);
        this.drop(data);
    }

    winternitzDecode1(target: StackItem, witness: StackItem[], publicKeys: Buffer[]) {
        if (witness.length != 2 || publicKeys.length != 2) throw new Error('Invalid length');
        const checksum = this.newStackItem(0);
        this.winternitzDecodeNibble(target, witness[0], publicKeys[0]);
        this.winternitzDecodeNibble(checksum, witness[1], publicKeys[1]);

        this.DATA(7);
        this.pick(checksum);
        this.OP_SUB();

        this.pick(target);
        this.OP_NUMEQUALVERIFY();
        this.drop(checksum);
    }

    checkPrehash(target: StackItem, prehash: StackItem, hash: Buffer) {
        this.pick(prehash);
        this.OP_HASH160();
        this.DATA(hash);
        this.OP_EQUAL();
        this.replaceWithTop(target);
    }

    lamportDecodeBit(target: StackItem, witness: StackItem, publicKeys: Buffer[]) {
        const temp = this.newStackItem(0);
        this.setBit_0(target);
        this.checkPrehash(temp, witness, publicKeys[0]);
        this.checkPrehash(target, witness, publicKeys[1]);
        this.pick(temp);
        this.pick(target);
        this.OP_BOOLOR();
        this.OP_VERIFY();
        this.drop(temp);
    }

    lamportDecode(targets: StackItem[], witness: StackItem[], publicKeys: Buffer[][]) {
        for (let i = 0; i < witness.length; i++) {
            this.lamportDecodeBit(targets[i], witness[i], publicKeys[i]);
        }
    }

    lamportEquivocation(witness: StackItem[], publicKeys: Buffer[]) {
        const agg = this.newStackItem(0);
        const temp = this.newStackItem(0);
        this.checkPrehash(agg, witness[0], publicKeys[0]);
        this.checkPrehash(temp, witness[0], publicKeys[1]);
        this.add(agg, agg, temp);
        this.checkPrehash(temp, witness[1], publicKeys[0]);
        this.add(agg, agg, temp);
        this.checkPrehash(temp, witness[1], publicKeys[1]);
        this.add(agg, agg, temp);
        this.pick(agg);
        this.OP_0_16(2);
        this.OP_GREATERTHANOREQUAL();
        this.OP_VERIFY();
        this.drop(agg);
        this.drop(temp);
    }

    winternitzCheck32(witness: StackItem[], publicKeys: Buffer[]) {
        const checksum = this.newStackItem(0);
        const temp = this.newStackItem(0);
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

        this.DATA(7);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
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

    winternitzDecode32(target: StackItem[], witness: StackItem[], publicKeys: Buffer[]) {
        const totalNibbles = 14;
        const checksum = this.newStackItem(0);

        for (let i = 0; i < totalNibbles; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
        }

        for (let i = 0; i < totalNibbles - 3; i++) {
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        this.DATA(7);
        this.pick(target[totalNibbles - 1]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
        this.pick(target[totalNibbles - 2]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
        this.pick(target[totalNibbles - 3]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
    }

    winternitzEquivocation32(target: StackItem[], witnessA: StackItem[], witnessB: StackItem[], publicKeys: Buffer[]) {
        //devide the witness in two 14 items arrays
        this.verifyNotEqualMany(witnessA, witnessB);
        this.winternitzDecode32(target, witnessA, publicKeys);
        this.winternitzDecode32(target, witnessB, publicKeys);
    }

    winternitzEquivocation256(target: StackItem[], witnessA: StackItem[], witnessB: StackItem[], publicKeys: Buffer[]) {
        //devide the witness in two 14 items arrays
        this.verifyNotEqualMany(witnessA, witnessB);
        this.winternitzDecode256(target, witnessA, publicKeys);
        this.winternitzDecode256(target, witnessB, publicKeys);
    }

    winternitzCheck24(witness: StackItem[], publicKeys: Buffer[]) {
        const totalNibbles = 10;
        const temp = this.newStackItem(0);
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 2; i++) checksumNibbles.push(this.newStackItem(0));
        const checksum = this.newStackItem(0);

        for (let i = 0; i < totalNibbles - 2; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 2; i++) {
            this.winternitzDecodeNibble(
                checksumNibbles[i],
                witness[totalNibbles - 2 + i],
                publicKeys[totalNibbles - 2 + i]
            );
        }

        this.DATA(7);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
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

    winternitzDecode24(target: StackItem[], witness: StackItem[], publicKeys: Buffer[]) {
        const totalNibbles = 10;
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 2; i++) checksumNibbles.push(this.newStackItem(0));
        const checksum = this.newStackItem(0);

        for (let i = 0; i < totalNibbles - 2; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 2; i++) {
            this.winternitzDecodeNibble(
                checksumNibbles[i],
                witness[totalNibbles - 2 + i],
                publicKeys[totalNibbles - 2 + i]
            );
        }

        this.DATA(7);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(checksumNibbles);
    }

    winternitzCheck256(witness: StackItem[], publicKeys: Buffer[]) {
        const totalNibbles = 90;
        const temp = this.newStackItem(0);
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 4; i++) checksumNibbles.push(this.newStackItem(0));
        const checksum = this.newStackItem(0);

        for (let i = 0; i < totalNibbles - 4; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 4; i++) {
            this.winternitzDecodeNibble(
                checksumNibbles[i],
                witness[totalNibbles - 4 + i],
                publicKeys[totalNibbles - 4 + i]
            );
        }

        this.DATA(7);
        this.pick(checksumNibbles[3]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
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

    winternitzDecode256(target: StackItem[], witness: StackItem[], publicKeys: Buffer[]) {
        const totalNibbles = 90;
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 4; i++) checksumNibbles.push(this.newStackItem(0));
        const checksum = this.newStackItem(0);

        for (let i = 0; i < totalNibbles - 4; i++) {
            this.winternitzDecodeNibble(target[i], witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(target[i]);
            this.OP_ADD();
            this.replaceWithTop(checksum);
        }

        for (let i = 0; i < 4; i++) {
            this.winternitzDecodeNibble(
                checksumNibbles[i],
                witness[totalNibbles - 4 + i],
                publicKeys[totalNibbles - 4 + i]
            );
        }

        this.DATA(7);
        this.pick(checksumNibbles[3]);
        this.OP_SUB();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[2]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[1]);
        this.OP_SUB();
        this.OP_ADD();

        this.mul(8);

        this.DATA(7);
        this.pick(checksumNibbles[0]);
        this.OP_SUB();
        this.OP_ADD();

        this.pick(checksum);
        this.OP_EQUAL();
        this.OP_VERIFY();

        this.drop(checksum);
        this.drop(checksumNibbles);
    }

    checkInitialTransaction(witness: StackItem[], publicKeys: Buffer[]) {
        for (let i = 0; i < 10; i++) {
            this.winternitzCheck256(witness.slice(i * 90, i * 90 + 90), publicKeys.slice(i * 90, i * 90 + 90));
        }
    }

    checkTransitionPatTransaction(witness: StackItem[], publicKeys: Buffer[]) {
        for (let i = 0; i < 3; i++) {
            this.winternitzCheck256(witness.slice(i * 90, i * 90 + 90), publicKeys.slice(i * 90, i * 90 + 90));
        }
    }

    checkTransitionVicTransaction(witness: StackItem[], publicKeys: Buffer[][]) {
        const temp = this.newStackItem(0);
        this.lamportDecodeBit(temp, witness[0], publicKeys[0]);
        this.lamportDecodeBit(temp, witness[1], publicKeys[1]);
    }

    checkStep2State(witness: StackItem[], publicKeys: Buffer[]) {
        for (let i = 0; i < witness.length / 14; i++) {
            this.winternitzCheck32(witness.slice(i * 14, i * 14 + 14), publicKeys.slice(i * 14, i * 14 + 14));
        }
    }

    verifySearchPath(searchPathWitness: StackItem[], searchPath: number[], publicKeys: Buffer[][]) {
        const temp = this.newStackItem(0);
        if (searchPathWitness.length != searchPath.length) throw new Error('Wrong lengths');
        for (let i = 0; i < searchPathWitness.length; i++) {
            this.lamportDecodeBit(temp, searchPathWitness[i], publicKeys[i]);
            if (searchPath[i] == 1) this.assertOne(temp);
            else this.assertZero(temp);
        }
    }

    verifySignature(publicKey: Buffer) {
        this.DATA(publicKey);
        this.OP_CHECKSIGVERIFY();
    }

    checkTimeout(blocks: number) {
        this.DATA(blocks);
        this.OP_CHECKSEQUENCEVERIFY();
        this.OP_DROP();
    }

    checkSemiFinal(pathNibbles: StackItem[][], indexNibbles: StackItem[]) {
        const temp = this.newStackItem(0);
        for (let i = 0; i < pathNibbles.length; i++) {
            this.pick(pathNibbles[i][1]);
            this.mul(8);
            this.pick(pathNibbles[i][0]);
            this.OP_ADD();
            this.pick(temp);
            this.mul(10);
            this.OP_ADD();
            this.replaceWithTop(temp);

            for (let j = 2; j < pathNibbles[i].length; j++) {
                this.pick(pathNibbles[i][j]);
                this.OP_0_16(0);
                this.OP_NUMEQUALVERIFY();
            }
        }

        const index = this.newStackItem(0);
        for (let i = indexNibbles.length - 1; i >= 0; i--) {
            this.pick(index);
            this.mul(8);
            this.pick(indexNibbles[i]);
            this.OP_ADD();
            this.replaceWithTop(index);
        }

        // check equality
        this.assertEqual(temp, index);
        this.drop(temp);
        this.drop(index);
    }

    verifyIndex(keys: Buffer[], indexWitness: StackItem[], indexNibbles: number[]) {
        const tempIndex = this.newNibbles(90);
        this.winternitzDecode256(tempIndex, indexWitness, keys);
        for (let i = 0; i < indexNibbles.length; i++) {
            this.DATA(indexNibbles[i], `indexNibbles_${i}`);
            this.pick(tempIndex[i]);
            this.OP_NUMEQUALVERIFY();
        }
        this.drop(tempIndex);
    }

    /***  META ***/

    programSizeInBitcoinBytes(): number {
        let total = 0;
        this.opcodes.forEach((op) => {
            if (op.data && op.data instanceof Buffer) {
                total += 1 + op.data.length;
            } else if (op.data && typeof op.data == 'number') {
                const n = op.data ?? 0;
                if (n < 127) total++;
                else total += 2;
            } else {
                total++;
            }
        });
        return total;
    }

    programToString(): string {
        let s = '';
        this.opcodes.forEach((op) => {
            if (op.data && op.data instanceof Buffer) {
                s += `<0x${op.data.toString('hex')}>\n`;
            } else if (op.data && typeof op.data == 'number') {
                s += `<0x${op.data.toString(16)}>\n`;
            } else {
                s += `${op.op}\n`;
            }
        });
        return s;
    }

    programToBinary(opts: ProgramToTemplateOpts = {}): Buffer {
        return this.programToTemplate(opts).buffer;
    }

    programToTemplate(opts: ProgramToTemplateOpts = {}): Template {
        const validateStack = opts.validateStack ?? true;

        // program has to end with a single 1 on the stack
        if (this.stack.length() == 0) {
            this.OP_0_16(1);
        } else if (this.stack.length() != 1 || this.stack.top().value !== 1) {
            if (validateStack) {
                throw new Error('Stack must have a single 1 at EOP');
            }
        }

        const items: { itemId: string; index: number }[] = [];

        const byteArray: number[] = [];
        for (const opcode of this.opcodes) {
            if (opcode.op == OpcodeType.DATA) {
                if (opcode.data && opcode.data instanceof Buffer) {
                    byteArray.push(opcode.data.length);
                    byteArray.push(...opcode.data);
                    items.push({ itemId: opcode.templateItemId!, index: byteArray.length });
                } else if (typeof opcode.data == 'number') {
                    if (opcode.data <= 16) {
                        byteArray.push(opcodeValues[hardcode(opcode.data)]);
                    } else {
                        const encoded = bitcoinjs.script.number.encode(opcode.data);
                        byteArray.push(encoded.length);
                        byteArray.push(...encoded);
                    }
                }
            } else {
                byteArray.push(opcodeValues[opcode.op!]);
            }
        }

        return { buffer: Buffer.from(byteArray), items };
    }
}

export function executeProgram(bitcoin: Bitcoin, script: Buffer, printFlag: boolean): boolean {
    let inIf = false;
    let inElse = false;
    let doIf = false;
    let doElse = false;

    const print = printFlag ? console.log : () => {};

    for (let i = 0; i < script.length; i++) {
        const opcode = opcodeMap[script[i]];

        if (opcode == OpcodeType.OP_IF) {
            inIf = true;
            inElse = false;
            doIf = bitcoin.stack.top().value != 0;
            doElse = !doIf;

            bitcoin.OP_IF();
            print(opcode);

            continue;
        }
        if (opcode == OpcodeType.OP_ELSE) {
            inIf = false;
            inElse = true;

            bitcoin.OP_ELSE();
            print(opcode);

            continue;
        }
        if (opcode == OpcodeType.OP_ENDIF) {
            inIf = false;
            inElse = false;

            bitcoin.OP_ENDIF();
            print(opcode);

            continue;
        }

        if (inIf && !doIf) continue;
        if (inElse && !doElse) continue;

        if (script[i] == 0) {
            bitcoin.OP_0_16(0);
            print('<0>');
        } else if (script[i] >= 81 && script[i] <= 96) {
            bitcoin.OP_0_16(1 + script[i] - 81);
            print(`<${1 + script[i] - 81}>`);
        } else if (script[i] > 0 && script[i] <= 75) {
            const b = script.subarray(i + 1, i + script[i] + 1);
            if (b.length == 1) {
                bitcoin.newStackItem(b[0]);
            } else if (b.length == 2) {
                bitcoin.newStackItem(b[0] + (b[1] << 8));
            } else {
                bitcoin.newStackItem(b);
            }
            i += b.length;
            print(`<${b.toString('hex')}>`);
        } else {
            (bitcoin as any)[String(opcode!)]();
            print(opcode);
        }
    }

    if (bitcoin.stack.length() != 1) throw new Error('Stack size must be 1');
    return bitcoin.success;
}
