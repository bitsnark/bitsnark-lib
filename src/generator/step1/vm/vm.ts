import { modInverse } from "../../common/math-utils";
import { prime_bigint } from "../../common/prime";
import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { regOptimizer } from "./reg-optimizer";
import { Instruction, InstrCode } from "./types";

export class VM {

    zero: Register;
    one: Register;

    hardcoded: bigint[] = [];
    witness: bigint[] = [];
    instructions: Instruction[] = [];
    success?: Register;
    registers: Register[] = [];

    hardcodedCache: any = {};
    instrCounter = 0;

    constructor() {
        this.zero = this.hardcode(0n);
        this.one = this.hardcode(1n);
    }

    public reset() {
        this.registers = this.registers.filter(r => r.hardcoded);
        this.instrCounter = 0;
        this.success = undefined;
        this.instructions = [];
        this.witness = [];
    }

    /// *** BASIC OPERATIONS ***

    private pushInstruction(name: InstrCode, target: Register, param1: Register, param2?: Register, bit?: number) {
        if (!this.success) throw new Error('Invalid state');
        this.instructions.push({ name, target: target.index, param1: param1.index, param2: param2?.index, bit });
        // if (this.instructions.length-1 == 24659)
        //     throw new Error('fubar');
        this.instrCounter++;
        if (this.instrCounter % 1000000 == 0) {
            //console.log(`line number: ${this.instrCounter} \t register count: ${this.state.registers.length}`);
        }
    }

    private setRegister(r: Register, v: bigint) {
        if (r.hardcoded && r.value !== v) throw new Error('Writing to hardcoded register');
        if (r.free) throw new Error('Setting free register?');
        r.value = v;
    }

    private fail(msg: string) {
        if (!this.success) throw new Error('Program not in running state');
        console.error(msg);
        this.success.value = 0n;
    }

    public newRegister(): Register {
        let r = { value: 0n, index: this.registers.length, hardcoded: false, witness: false };
        r.index = this.registers.length;
        this.registers[r.index] = r;
        return r;
    }

    public hardcode(value: bigint): Register {

        let t = this.hardcodedCache[value.toString(16)];
        if (t) return t;

        if (this.instructions.length > 0 || this.witness.length > 0) 
            throw new Error('Hardcoded first please');
        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');

        this.hardcoded.push(value);
        t = this.newRegister();
        t.value = value;
        t.hardcoded = true;
        this.hardcodedCache[value.toString(16)] = t;
        return t;
    }

    public addWitness(value: bigint): Register {

        if (this.instructions.length > 0) throw new Error('Witness second please');
        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');
        
        this.witness.push(value);
        const t = this.newRegister();
        t.witness = true;
        t.value = value;
        return t;
    }

    public startProgram() {
        if (this.success) throw new Error('Already started');
        this.success = this.newRegister();
        this.mov(this.success, this.one);
    }

    /// *** BASIC INSTRUCTIONS *** ///

    addMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.ADDMOD, target, a, b);
        let v = (a.value % prime_bigint + b.value % prime_bigint) % prime_bigint;
        this.setRegister(target, v);
    }

    subMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.SUBMOD, target, a, b);
        let v = (prime_bigint + a.value - b.value) % prime_bigint;
        this.setRegister(target, v);
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

    mulMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.MULMOD, target, a, b);
        this.setRegister(target, (a.value * b.value) % prime_bigint);
    }

    or(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.OR, target, a, b);
        this.setRegister(target, !!a.value || !!b.value ? 1n : 0n);
    }

    and(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.AND, target, a, b);
        this.setRegister(target, !!a.value && !!b.value ? 1n : 0n);
    }

    not(target: Register, a: Register) {
        this.pushInstruction(InstrCode.NOT, target, a);
        this.setRegister(target, !a.value ? 1n : 0n);
    }

    divMod(target: Register, a: Register, b: Register) {
        let v = 0n;
        try {
            v = modInverse(b.value, prime_bigint) as bigint;
        } catch (e) {
            // Divide by zero. Return 0 because we can't fail here.
        }
        v = (a.value * v) % prime_bigint;
        this.pushInstruction(InstrCode.DIVMOD, target, a, b);
        this.setRegister(target, v);
    }

    mov(target: Register, a: Register) {
        this.pushInstruction(InstrCode.MOV, target, a);
        this.setRegister(target, a.value);
    }

    assertEqZero(r: Register) {
        this.pushInstruction(InstrCode.ASSERTZERO, this.success!, r);
        if (r.value != 0n) this.fail('assert zero');
    }

    assertEqOne(r: Register) {
        this.pushInstruction(InstrCode.ASSERTONE, this.success!, r);
        if (r.value != 1n) this.fail('assert one');
    }

    /******* complex functions  *******/

    ignoreFailure(a: () => void) {
        let f = this.success;
        a();
        this.success = f;
    }

    ignoreFailureInExactlyOne(a: () => void, b: () => void) {
        if (!this.success) throw new Error('Invalid state');
        let count = 0;
        let f = this.success;
        a();
        count += this.success ? 0 : 1;
        this.success.value = 1n;
        b();
        count += this.success ? 0 : 1;
        this.success.value = count == 1 ? 1n : 0n;
    }

    assertEq(a: Register, b: Register) {
        const temp = this.newRegister();
        this.equal(temp, a, b);
        this.assertEqOne(temp);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = this.newRegister();
        this.andBit(t1, f, 0, a);
        const notF = this.newRegister();
        this.addMod(notF, f, this.one);
        const t2 = this.newRegister();
        this.andBit(t2, notF, 0, b);
        this.addMod(target, t1, t2);
    }

    /// *** HIGH LEVEL *** ///

    public optimizeRegs() {
        regOptimizer(this);
    }

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
                bit: instr.bit,
            })),
        };
    }

    getSuccess(): boolean {
        return this.success?.value != 0n;
    }
}

export let step1_vm: VM = new VM();
