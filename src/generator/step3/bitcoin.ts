import { hardcode, OpcodeType } from "./bitcoin-opcodes";
import { StackItem, Stack } from "./stack";

interface Operation {
    op?: OpcodeType;
    data?: number;
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
    altStack: number[] = [];
    witness: number[] = [];
    success = true;

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

    private newStackItem(value?: number): StackItem {
        if (this.stack.items.length + this.altStack.length > 1000) throw new Error('Stack too big');

        value = value ?? 0;
        const si = this.stack.newItem(value);
        if (value <= 16)
            this.opcodes.push({ op: hardcode(value) });
        else
            this.opcodes.push({ op: OpcodeType.OP_PUSHDATA4, data: value })
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
            sr.stackItems.push(this.newStackItem(Number(b)));
        }
        return sr;
    }

    /// NATIVE OPERATIONS ///

    DATA(data: number) {
        if (data > 0 && data <= 16) {
            this.opcodes.push({ op: hardcode(data) });
        } else {
            this.opcodes.push({ op: OpcodeType.DATA, data });
        }
        this.stack.newItem(data);
    }

    OP_ROLL() {
        this.opcodes.push({ op: OpcodeType.OP_ROLL });
        const si = this.stack.pop();
        this.stack.roll(this.stack.length() - 1 - si.value);
    }

    OP_PICK() {
        this.opcodes.push({ op: OpcodeType.OP_PICK });
        const si = this.stack.pop();
        this.stack.pick(this.stack.length() - 1 - si.value);
    }

    OP_DROP() {
        this.opcodes.push({ op: OpcodeType.OP_DROP });
        this.stack.pop();
    }

    OP_NIP() {
        this.opcodes.push({ op: OpcodeType.OP_NIP });
        const t1 = this.stack.pop();
        const t2 = this.stack.pop();
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

    OP_IF_SMARTASS(tfn: () => void, ffn?: () => void) {
        this.opcodes.push({ op: OpcodeType.OP_IF });
        const si = this.stack.pop();
        const s_before = this.stack.saveState();
        let s_afterFalse = s_before;
        tfn();
        const s_afterTrue = this.stack.saveState();
        if (ffn) {
            this.opcodes.push({ op: OpcodeType.OP_ELSE });
            this.stack.fromSavedState(s_before);
            ffn();
            s_afterFalse = this.stack.saveState();
        }
        this.opcodes.push({ op: OpcodeType.OP_ENDIF });
        if (si.value == 1) {
            this.stack.fromSavedState(s_afterTrue);
        } else {
            this.stack.fromSavedState(s_afterFalse);
        }
    }

    OP_0_16(n: number) {
        this.opcodes.push({ op: hardcode(n) });
        this.stack.newItem(n);
    }

    OP_NUMEQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUAL });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(si1.value === si2.value ? 1 : 0);
    }

    OP_NOT() {
        this.opcodes.push({ op: OpcodeType.OP_NOT });
        const si = this.stack.pop();
        this.stack.newItem(si.value === 0 ? 1 : 0);
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
        this.stack.newItem(si1.value > si2.value ? 1 : 0);
    }

    OP_GREATERTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_GREATERTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value >= si2.value ? 1 : 0);
    }

    OP_LESSTHAN() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHAN });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value < si2.value ? 1 : 0);
    }

    OP_LESSTHANOREQUAL() {
        this.opcodes.push({ op: OpcodeType.OP_LESSTHANOREQUAL });
        const si2 = this.stack.pop();
        const si1 = this.stack.pop();
        this.stack.newItem(si1.value <= si2.value ? 1 : 0);
    }

    OP_BOOLOR() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLOR });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value || !!si2.value ? 1 : 0);
    }

    OP_BOOLAND() {
        this.opcodes.push({ op: OpcodeType.OP_BOOLAND });
        const si1 = this.stack.pop();
        const si2 = this.stack.pop();
        this.stack.newItem(!!si1.value && !!si2.value ? 1 : 0);
    }

    OP_WITHIN() {
        this.opcodes.push({ op: OpcodeType.OP_WITHIN });
        const x = this.stack.pop().value;
        let min = this.stack.pop().value;
        let max = this.stack.pop().value;
        const t = min;
        min = min < max ? min : max;
        max = t < max ? max : t;
        this.stack.newItem(x >= min && x <= max ? 1 : 0);
    }

    OP_NUMEQUALVERIFY() {
        this.opcodes.push({ op: OpcodeType.OP_NUMEQUALVERIFY });
        const f = this.stack.pop().value;
        if (f != 1) this.fail();
    }

    OP_TOALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_TOALTSTACK });
        const si = this.stack.pop();
        this.altStack.push(si.value);
    }

    OP_FROMALTSTACK() {
        this.opcodes.push({ op: OpcodeType.OP_FROMALTSTACK });
        this.stack.newItem(this.altStack.pop()!);
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
            this.newStackItem(rel);
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

    ifTrue(si: StackItem, tfn: () => void, ffn?: () => void) {
        this.pick(si);
        this.OP_IF_SMARTASS(tfn, ffn);
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

    assertZero(a: StackItem) {
        this.pick(a);
        this.OP_0_16(0);
        this.OP_NUMEQUALVERIFY()
    }

    assertEqual(a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_NUMEQUALVERIFY()
    }

    /********* helpers *********/

    private addBit(target: StackItem, carry: StackItem, a: StackItem, b: StackItem) {
        this.pick(a);
        this.pick(b);
        this.OP_ADD();
        this.pick(carry);
        this.OP_ADD();
        this.OP_DUP();
        this.OP_0_16(2);
        this.OP_GREATERTHANOREQUAL();
        this.OP_DUP();
        this.replaceWithTop(carry);
        this.OP_IF();
        this.OP_0_16(2);
        this.OP_SUB();
        this.OP_ENDIF();
        this.replaceWithTop(target);
    }

    assertEqual32(a: SimulatedRegister, b: SimulatedRegister) {
        for (let i = 0; i < 32; i++) {
            this.assertEqual(a.stackItems[i], b.stackItems[i]);
        }
    }

    equal32(target: StackItem, a: SimulatedRegister, b: SimulatedRegister) {
        this.OP_0_16(1);
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
        const carry = this.newStackItem();
        const temp = this.newStackItem();
        this.addBit(temp, carry, a.stackItems[0], b.stackItems[0]);
        this.assertEqual(temp, c.stackItems[0]);
        for (let i = 0; i < 32; i++) {
            this.addBit(temp, carry, a.stackItems[i], b.stackItems[i]);
            this.assertEqual(temp, c.stackItems[i]);
        }
    }

    step2_addOf(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const carry = this.newStackItem();
        const temp = this.newStackItem();
        this.addBit(temp, carry, a.stackItems[0], b.stackItems[0]);
        for (let i = 0; i < 32; i++) {
            this.addBit(temp, carry, a.stackItems[i], b.stackItems[i]);
        }
        this.checkUpperZero(c);
        this.assertEqual(carry, c.stackItems[0]);
    }

    step2_sub(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {

    }

    step2_subOf(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {

    }

    step2_mov(a: SimulatedRegister, c: SimulatedRegister) {
        this.assertEqual32(a, c);
    }

    step2_equal(a: SimulatedRegister, b: SimulatedRegister, c: SimulatedRegister) {
        const temp = this.newStackItem();
        this.equal32(temp, a, b);
        this.checkUpperZero(c);
        this.assertEqual(temp, c.stackItems[0]);
    }

    step2_andBit(a: SimulatedRegister, b: SimulatedRegister, bit: number, c: SimulatedRegister) {

    }

    step2_andNotBit(a: SimulatedRegister, b: SimulatedRegister, bit: number, c: SimulatedRegister) {

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
}
