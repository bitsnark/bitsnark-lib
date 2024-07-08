import { prime_bigint } from "../../common/prime";
import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { Instruction, InstrCode, _256 } from "./types";

function _256toN(ra: _256): bigint {
    let n = 0n;
    for (let i = 0; i < 8; i++) {
        n = n + (ra[i].value << BigInt(i * 32));
    }
    return n;
}

export class VM {

    hardcoded: bigint[] = [];
    witness: bigint[] = [];
    instructions: Instruction[] = [];
    success?: Register;
    registers: Register[] = [];

    hardcodedCache: any = {};
    instrCounter = 0;

    pool: Register[] = [];

    zero: Register;
    one: Register;
    prime: _256 = [];

    constructor() {
        this.zero = this.hardcode(0n);
        this.one = this.hardcode(1n);
        for (let i = 0; i < 8; i++) {
            const t = (prime_bigint >> BigInt(i * 32)) & 0xffffffffn;
            this.prime[i] = this.hardcode(t);
        }
    }

    reset() {
        this.registers = this.registers.filter(r => r.hardcoded);
        this.instrCounter = 0;
        this.success = undefined;
        this.instructions = [];
        this.witness = [];
    }

    _256ToN(ra: _256): bigint {
        const pad = (s: string) => {
            while(s.length < 8) s = '0' + s;
            return s;
        }
        let s = '';
        for (let i = 0; i < 8; i++) {
            s = pad(ra[i].value.toString(16)) + s;
        }
        return BigInt('0x' + s);
    }

    startProgram() {
        if (this.success) throw new Error('Already started');
        this.success = this.newRegister();
        this.mov(this.success, this.one);
    }
    
    /// *** BASIC OPERATIONS ***

    private pushInstruction(name: InstrCode, target: Register, param1?: Register, param2?: Register, bit?: number) {
        if (!this.success) throw new Error('Program not in running state');
        this.instructions.push({ name, target: target.index, param1: param1?.index, param2: param2?.index, bit });
        this.instrCounter++;
        if (this.instrCounter % 1000000 == 0) {
            //console.log(`line number: ${this.instrCounter} \t register count: ${this.state.registers.length}`);
        }
    }

    public setRegister(r: Register, v: bigint) {
        if (r.hardcoded && r.value !== v) throw new Error('Writing to hardcoded register');
        if (r.free) throw new Error('Setting free register?');
        r.value = v;
    }

    private fail(msg: string) {
        if (!this.success) throw new Error('Program not in running state');
        this.success.value = 0n;
        try {
            throw new Error(msg);
        } catch (e) {
            console.error(e);
        }
    }

    /// *** BASIC INSTRUCTIONS *** ///

    public newRegister(makeZero?: boolean): Register {
        let r = this.pool.pop()
        if (!r) {
            r = { value: 0n, index: this.registers.length, hardcoded: false, witness: false };
            r.index = this.registers.length;
            this.registers[r.index] = r;    
        }
        if (makeZero) this.mov(r, this.zero);
        return r;
    }

    public freeRegister(r: Register) {
        this.pool.push(r);
    }

    public newTemp256(makeZero?: boolean): _256 {
        const t: _256 = [];
        for (let i = 0; i < 8; i++) t.push(this.newRegister(makeZero));
        return t;
    }

    public freeTemp256(ra: _256) {
        ra.forEach(r => this.freeRegister(r));
    }

    public hardcode(value: bigint): Register {

        let t = this.hardcodedCache[value.toString(16)];
        if (t) return t;

        if (this.instructions.length > 0 || this.witness.length > 0) throw new Error('Hardcoded first please');
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');

        this.hardcoded.push(value);
        t = this.newRegister();
        t.value = value;
        t.hardcoded = true;
        this.hardcodedCache[value.toString(16)] = t;
        return t;
    }

    public addWitness(value: bigint): Register {

        if (this.instructions.length > 0) throw new Error('Witness second please');
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        
        this.witness.push(value);
        const t = this.newRegister();
        t.witness = true;
        t.value = value;
        return t;
    }

    //**** basic instructions ******/

    add(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.ADD, target, a, b);
        let v = (a.value + b.value) & 0xffffffffn;
        this.setRegister(target, v);
    }

    addOF(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.ADDOF, target, a, b);
        let v = (a.value + b.value) >> 32n;
        this.setRegister(target, v);
    }

    sub(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.SUB, target, a, b);
        let v = a.value >= b.value ? a.value - b.value : a.value + 0x0100000000n - b.value;
        this.setRegister(target, v);
    }

    subOF(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.SUBOF, target, a, b);
        let v = a.value >= b.value ? 0n : 1n;
        this.setRegister(target, v);
    }

    mov(target: Register, a: Register) {
        this.pushInstruction(InstrCode.MOV, target, a);
        this.setRegister(target, a.value);
    }

    andBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDBIT, target, a, b, bit);
        const v = !!(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    andNotBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDNOTBIT, target, a, b, bit);
        const v = !(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    equal(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.EQUAL, target, a, b);
        this.setRegister(target, a.value === b.value ? 1n : 0n);
    }

    rotr(target: Register, a: Register, n: Register) {
        this.pushInstruction(InstrCode.ROTR, target, a, n)
        this.setRegister(target, a.value >> n.value | a.value << (32n - n.value))
    }

    shr(target: Register, a: Register, n: Register) {
        this.pushInstruction(InstrCode.SHR, target, a, n)
        this.setRegister(target, a.value >> n.value)
    }

    or(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.OR, target, a, b);
        this.setRegister(target, a.value | b.value);
    }

    and(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.AND, target, a, b);
        this.setRegister(target, a.value & b.value);
    }

    xor(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.XOR, target, a, b);
        this.setRegister(target, a.value ^ b.value);
    }

    not(target: Register, a: Register) {
        this.pushInstruction(InstrCode.NOT, target, a);
        this.setRegister(target, a.value ^ 0xffffffffn);
    }

    assertOne(a: Register) {
        this.pushInstruction(InstrCode.ASSERTONE, this.success!, a);
        if (a.value != 1n) this.fail('assert equal');
    }

    //**** complex instructions ******/

    initHardcoded(hardcoded: bigint[]): Register[] {
        return hardcoded.map(n => this.hardcode(n));
    }

    assertEq(a: Register, b: Register) {
        const temp = this.newRegister();
        this.equal(temp, a, b)
        this.assertOne(temp);
        this.freeRegister(temp);
    }

    andBitOr(target: Register, a: Register, bit: number, b: Register, c: Register) {
        const temp1 = this.newRegister();
        const temp2 = this.newRegister();
        this.andBit(temp1, a, bit, b);
        this.andNotBit(temp2, a, bit, c);
        this.add(target, temp1, temp2);
        this.freeRegister(temp1);
        this.freeRegister(temp2);
    }

    // WARNING: if a or b are greater than the prime the result could be wrong

    add256Mod(target: _256, a: _256, b: _256) {
        const overflow = this.newRegister();
        const carry2 = this.newRegister();
        const temp = this.newRegister();
        const temp2 = this.newRegister();
        const temp256 = this.newTemp256();

        this.add(temp256[0], a[0], b[0]);
        this.addOF(overflow, a[0], b[0]);
        for (let i = 1; i < 7; i++) {
            this.add(temp, a[i], overflow);
            this.addOF(overflow, a[i], overflow);
            this.add(temp256[i], temp, b[i]);
            this.addOF(carry2, temp, b[i]);
            this.add(overflow, overflow, carry2);
        }
        this.add(temp, a[7], overflow);
        this.add(temp256[7], temp, b[7]);

        this.sub(target[0], temp256[0], this.prime[0]);
        this.subOF(overflow, temp256[0], this.prime[0]);
        for (let i = 1; i < 8; i++) {
            this.sub(temp, temp256[i], overflow);
            this.subOF(overflow, temp256[i], overflow);
            this.sub(target[i], temp, this.prime[i]);
            this.subOF(carry2, temp, this.prime[i]);
            this.add(overflow, overflow, carry2);
        }

        for (let i = 0; i < 8; i++) {
            this.andBitOr(target[i], overflow, 0, temp256[i], target[i]);
        }

        this.freeRegister(overflow);
        this.freeRegister(carry2);
        this.freeRegister(temp);
        this.freeRegister(temp2);
        this.freeTemp256(temp256);
    }

    mov256(target: _256, a: _256) {
        for (let i = 0; i < 8; i++) this.mov(target[i], a[i]);
    }

    andBit256(target: _256, a: Register, bit: number, b: _256) {
        for (let i = 0; i < 8; i++) this.andBit(target[i], a, bit, b[i]);
    }

    assertEqual256(a: _256, b: _256) {
        for (let i = 0; i < 8; i++) this.assertEq(a[i], b[i]);
    }

    //**** step1 instructions ******/

    step1_addMod(a: _256, b: _256, c: _256) {
        const temp256 = this.newTemp256();
        this.add256Mod(temp256, a, b);
        this.assertEqual256(temp256, c);
        this.freeTemp256(temp256);
    }

    step1_subMod(a: _256, b: _256, c: _256) {
        this.step1_addMod(b, c, a);
    }

    step1_andBit(a: _256, bit: number, b: _256, c: _256) {
        const temp1 = this.newRegister();
        const chunk = Math.floor(bit / 32);
        bit = bit % 32;
        for (let i = 0; i < 8; i++) {
            this.andBit(temp1, a[chunk], bit, b[i]);
            this.assertEq(c[i], temp1);
        }
        this.freeRegister(temp1);
    }

    step1_andNotBit(a: _256, bit: number, b: _256, c: _256) {
        const temp1 = this.newRegister();
        const temp2 = this.newRegister();
        const chunk = Math.floor(bit / 32);
        bit = bit % 32;
        this.not(temp1, a[chunk]);
        for (let i = 0; i < 8; i++) {
            this.andBit(temp2, temp1, bit, b[i]);
            this.assertEq(c[i], temp2);
        }
        this.freeRegister(temp1);
        this.freeRegister(temp2);
    }

    step1_equal(a: _256, b: _256, c: _256) {
        const temp = this.newRegister();
        this.checkUpperZero(c);
        for (let i = 0; i < 8; i++) {
            this.equal(temp, a[i], b[i]);
            this.assertEq(temp, c[0]);
        }
        this.freeRegister(temp);
    }

    step1_mulMod(a: _256, b: _256, c: _256) {
        const agg = this.newTemp256();
        this.mov256(agg, a);
        this.freeTemp256(a);

        const result = this.newTemp256(true);
        const temp = this.newTemp256();

        for (let i = 0; i < 256; i++) {
            this.andBit256(temp, b[Math.floor(i / 32)], i % 32, agg);
            this.add256Mod(result, result, temp);
            if (i != 255) {
                this.add256Mod(agg, agg, agg);
            }
        }
        this.assertEqual256(result, c);

        this.freeTemp256(agg);
        this.freeTemp256(result);
        this.freeTemp256(temp);
    }

    step1_divMod(a: _256, b: _256, c: _256) {
        this.step1_mulMod(c, b, a);
    }

    private checkUpperZero(a: _256) {
        for (let i = 1; i<8; i++) {
            this.assertEq(a[i], this.zero);
        }
    }

    step1_not(a: _256, c: _256) {
        const temp = this.newRegister();
        this.checkUpperZero(c);
        this.not(temp, a[0]);
        this.and(temp, temp, this.one);
        this.assertEq(temp, c[0]);
        this.freeRegister(temp);
    }

    step1_or(a: _256, b: _256, c: _256) {
        const temp = this.newRegister();
        this.checkUpperZero(c);
        this.or(temp, a[0], b[0]);
        this.and(temp, temp, this.one);
        this.assertEq(temp, c[0]);
        this.freeRegister(temp);
    }

    step1_and(a: _256, b: _256, c: _256) {
        const temp = this.newRegister();
        this.checkUpperZero(c);
        this.and(temp, a[0], b[0]);
        this.and(temp, temp, this.one);
        this.assertEq(temp, c[0]);
        this.freeRegister(temp);
    }

    step1_mov(a: _256, b: _256) {
        this.assertEqual256(a, b);
    }

    step1_assertEqZero(a: _256) {
        this.checkUpperZero(a);
        this.assertEq(a[0], this.zero);
    }

    step1_assertEqOne(a: _256) {
        this.checkUpperZero(a);
        this.assertEq(a[0], this.one);
    }

    step1_end(a: _256) {
        this.step1_assertEqOne(a);
    }

    /// *** HIGH LEVEL *** ///

    public save(): SavedVm<InstrCode> {
        return {
            hardcoded: this.hardcoded.map(r => r.toString(16)),
            witness: this.witness.map(r => r.toString(16)),
            registers: this.registers.length,
            programLength: this.instructions.length,
            successIndex: this.success?.index ?? 0,
            program: this.instructions.map(instr => ({
                name: instr.name,
                target: instr.target,
                param1: instr.param1,
                param2: instr.param2,
                data: instr.bit
            })),
        };
    }
}

export let step2_vm: VM = new VM();
