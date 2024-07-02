import { hardcode, OpcodeType } from "./bitcoin-opcodes";
import { StackItem, Stack } from "./stack";
import { createHash } from 'crypto';

interface Operation {
    op?: OpcodeType;
    data?: bigint;
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
    maxStack = 0;

    constructor() {
    }

    reset() {
        this.opcodes = [];
        this.stack = new Stack();
        this.simulatedRegisters = new Map<number, SimulatedRegister>();
        this.success = true;
    }

    fail() {
        this.success = false;
    }

    /// BASIC ///

    newStackItem(value: bigint, name: string = ''): StackItem {
        value = value ?? 0;
        const si = this.stack.newItem(value);
        si.name = name;
        if (value <= 16) this.opcodes.push({ op: hardcode(value) });
        else this.opcodes.push({ op: OpcodeType.DATA, data: value })

        this.maxStack = Math.max(this.maxStack, this.stack.items.length);
        if (this.stack.items.length + this.altStack.length > 1000) throw new Error('Stack too big');
        return si;
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
        return si;
    }

    hardcode(n: bigint): StackItem {
        return this.newStackItem(n);
    }

    /// NATIVE OPERATIONS ///

    DATA(data: bigint) {
        if (data >= 0 && data <= 16) {
            this.opcodes.push({ op: hardcode(data) });
        } else {
            this.opcodes.push({ op: OpcodeType.DATA, data });
        }
        this.stack.newItem(data);
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

    OP_SUB() {
        this.opcodes.push({ op: OpcodeType.OP_ADD });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value - si2.value);
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
        if (f1 != f2) this.fail();
    }

    OP_TOALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_TOALTSTACK });
        const si = this.stack.pop();
        this.altStack.push(si.value);
    }

    OP_FROMALTSTACK() {
        if (this.altStack.length == 0) this.fail();
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
        this.opcodes.push({ op: OpcodeType.OP_VERIFY});
        const t = this.stack.items.pop()!;
        if (!t.value) this.fail();
    }

    OP_SHA256() {
        this.opcodes.push({ op: OpcodeType.OP_SHA256 });
        const t = this.stack.items.pop()!;
        let hex = t.value.toString(16);
        while (hex.length < 64) hex = '0' + hex;
        const h = createHash('sha256').update(hex, 'hex').digest('hex');
        this.stack.newItem(BigInt('0x' + h));
    }

    /// Complex operations ///

    roll(si: StackItem) {
        const rel = this.getRelativeStackPosition(si);
        if (rel == 0) return;
        this.stack.newItem(BigInt(rel));
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

    add(target: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.replaceWithTop(target);
    }

    assertZero(a: StackItem) {
        this.pick(a);
        this.OP_0_16(0n);
        this.OP_NUMEQUALVERIFY()
    }

    assertEqual(a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_NUMEQUALVERIFY()
    }

    setIfElse(target: StackItem, v: StackItem, t: StackItem, f: StackItem) {
        const temp = !!v.value ? t.value : f.value;
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

    assertEqual32(a: SimulatedRegister, b: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.assertEqual(a.stackItems[i], b.stackItems[i]);
        }
    }

    assertZero32(a: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.assertZero(a.stackItems[i]);
        }
    }

    equal32(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
        this.OP_0_16(1n);
        for (let i = 0; i < 32; i++) {
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.OP_NUMEQUAL();
            this.OP_BOOLAND();
        }
        this.replaceWithTop(target);
    }

    checkUpperZero(a: SimulatedRegister) {
        for (let i = 1; i < 8; i++) {
            this.assertZero(a.stackItems[i]);
        }
    }

    /********* step 2 *********/

    step2_add(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const carry = this.newStackItem(0n, 'carry');
        const temp = this.newStackItem(0n, 'temp');
        for (let i = 0; i < 32; i++) {
            this.addBit(temp, carry, a.stackItems[i], b.stackItems[i]);
            this.assertEqual(temp, c.stackItems[i]);
        }
        this.drop(temp);
        this.drop(carry);
    }

    step2_addOf(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const carry = this.newStackItem(0n, 'carry');
        const temp = this.newStackItem(0n, 'temp');
        for (let i = 0; i < 32; i++) {
            this.addBit(temp, carry, a.stackItems[i], b.stackItems[i]);
        }
        this.checkUpperZero(c);
        this.assertEqual(carry, c.stackItems[0]);
        this.drop(temp);
        this.drop(carry);
    }

    step2_sub(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const carry = this.newStackItem(0n, 'carry');
        const temp = this.newStackItem(0n, 'temp');
        for (let i = 0; i < 32; i++) {
            this.addBit(temp, carry, b.stackItems[i], c.stackItems[i]);
            this.assertEqual(temp, a.stackItems[i]);
        }
        this.drop(temp);
        this.drop(carry);
    }

    step2_subOf(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        this.checkUpperZero(c);
        const temp = this.newStackItem(0n, 'temp');
        const done = this.newStackItem(0n, 'done');
        const b_bigger = this.newStackItem(0n, 'b_bigger');
        for (let i = 31; i >= 0; i--) {
            this.pick(b.stackItems[i]);
            this.pick(a.stackItems[i]);
            this.OP_GREATERTHAN();
            this.replaceWithTop(temp);
            this.setIfElse(b_bigger, done, b_bigger, temp);
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.OP_NUMEQUAL();
            this.OP_NOT();
            this.pick(done);
            this.OP_BOOLOR();
            this.replaceWithTop(done);
        }
        this.assertEqual(b_bigger, c.stackItems[0]);
        this.drop(temp);
        this.drop(done);
        this.drop(b_bigger);
    }

    step2_mov(a: SimulatedRegister, c: SimulatedRegister) {
        this.assertEqual32(a, c);
    }

    step2_equal(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const temp = this.newStackItem(0n, 'temp');
        this.equal32(temp, a, b);
        this.checkUpperZero(c);
        this.assertEqual(temp, c.stackItems[0]);
        this.drop(temp);
    }

    step2_andBit(a: SimulatedRegister, b: SimulatedRegister, bit: number, c: SimulatedRegister) {
        this.pick(b.stackItems[bit]);
        this.OP_IF();
        this.assertEqual32(a, c);
        this.OP_ELSE();
        this.assertZero32(c);
        this.OP_ENDIF();
    }

    step2_andNotBit(a: SimulatedRegister, b: SimulatedRegister, bit: number, c: SimulatedRegister) {
        this.pick(b.stackItems[bit]);
        this.OP_IF();
        this.assertZero32(c);
        this.OP_ELSE();
        this.assertEqual32(a, c);
        this.OP_ENDIF();
    }

    step2_shr(a: SimulatedRegister, b: number, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            const t = (32 + i - b) % 32;
            if (i >= b) {
                this.assertEqual(a.stackItems[i], c.stackItems[t]);
            } else {
                this.assertZero(c.stackItems[t]);
            }
        }
    }

    step2_rotr(a: SimulatedRegister, b: number, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            const t = (32 + i - b) % 32;
            this.assertEqual(a.stackItems[i], c.stackItems[t]);
        }
    }

    step2_and(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.OP_BOOLAND();
            this.pick(c.stackItems[i]);
            this.OP_NUMEQUALVERIFY();
        }
    }

    step2_xor(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            // !a & b
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.OP_NOT();
            this.OP_BOOLAND();
            // a & !b
            this.pick(b.stackItems[i]);
            this.pick(a.stackItems[i]);
            this.OP_NOT();
            this.OP_BOOLAND();
            // (!a & b) | (a & !b)
            this.OP_BOOLOR();

            this.pick(c.stackItems[i]);
            this.OP_NUMEQUALVERIFY();
        }
    }

    step2_or(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.pick(a.stackItems[i]);
            this.pick(b.stackItems[i]);
            this.OP_BOOLOR();
            this.pick(c.stackItems[i]);
            this.OP_NUMEQUALVERIFY();
        }
    }

    step2_not(a: SimulatedRegister, c: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.pick(a.stackItems[i]);
            this.OP_NOT();
            this.pick(c.stackItems[i]);
            this.OP_NUMEQUALVERIFY();
        }
    }

    step2_assertEqual(a: SimulatedRegister, b: SimulatedRegister) {
        this.assertEqual32(a, b);
    }

    /***  Witness decoding ***/

    checkPrehash(target: StackItem, prehash: StackItem, hash: bigint) {
        this.pick(prehash);
        this.OP_SHA256();
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

    winternitzDecodeNibble(target: StackItem, witness: StackItem, publicKey: bigint) {
        const pk = this.newStackItem(publicKey);
        this.pick(witness); // witness
        for (let i = 0; i < 8; i++) {
            this.OP_SHA256(); // hash
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

    winternitzDecode32(target: StackItem[], witness: StackItem[], publicKeys: bigint[]) {

        const totalNibbles = witness.length;
        const checksum = this.newStackItem(0n, 'checksum');

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

    winternitzCheck256(witness: StackItem[], publicKeys: bigint[]) {

        const totalNibbles = witness.length;
        const temp = this.newStackItem(0n, 'temp');
        const checksumNibbles: StackItem[] = [];
        for (let i = 0; i < 4; i++) checksumNibbles.push(this.newStackItem(0n, 'cs nibble'));
        const checksum = this.newStackItem(0n, 'checksum');

        for (let i = 0; i < totalNibbles - 4; i++) {
            this.winternitzDecodeNibble(temp, witness[i], publicKeys[i]);
            this.pick(checksum);
            this.pick(temp);
            this.OP_ADD();
            this.replaceWithTop(checksum);    
        }

        for (let i = 0; i < 4; i++)  {
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
    }

    checkInitialTransaction(witness: StackItem[], publicKeys: bigint[]) {
        for (let i = 0; i < 10; i++) {
            this.winternitzCheck256(witness.slice(i * 90, i * 90 + 90), publicKeys.slice(i * 90, i * 90 + 90));
        }
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

    programToString() {
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
}
