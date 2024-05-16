import { modInverse } from "../../common/math-utils";
import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { State } from "../../common/state";
import { prime_bigint } from "./prime";
import { regOptimizer } from "./reg-optimizer";
import { Instruction, InstrCode } from "./types";

export class VM {

    R_0: Register;
    R_1: Register;
    R_2: Register;


    state: State;
    witness: bigint[] = [];
    hardcoded: bigint[] = [];
    hardcodedCache: any = {};
    instructions: Instruction[] = [];
    success = true;

    constructor() {
        this.state = new State();
        this.R_0 = this.hardcode(0n);
        this.R_1 = this.hardcode(1n);
        this.R_2 = this.hardcode(2n);
    }

    /// *** BASIC OPERATIONS ***

    private pushInstruction(name: InstrCode, target: Register, params: Register[], data?: bigint) {
        this.instructions.push({ name, target, params, data });
        if (this.instructions.length % 1000000 == 0) {
            console.log(`line number: ${this.instructions.length} \t register count: ${this.state.registers.length}`);
        }
    }

    private setRegister(r: Register, v: bigint) {
        if (r.hardcoded && r.value !== v) {
            this.fail('Writing to hardcoded register');
        }
        r.value = v;
    }

    private fail(msg: string) {
        this.success = false;
        try {
            throw new Error(msg);
        } catch (e) {
            console.error(e)
        }
    }

    /// *** BASIC INSTRUCTIONS *** ///

    public newRegister(): Register {
        return this.state.newRegister();
    }

    public hardcode(value: bigint): Register {
        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');
        let t = this.hardcodedCache[value.toString(16)];
        if (t) return t;
        t = new Register();
        t.value = value;
        t.hardcoded = true;
        this.hardcodedCache[value.toString(16)] = t;
        this.hardcoded.push(t);
        return t;
    }

    public addWitness(value: bigint): Register {
        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');
        const t = this.newRegister();
        t.value = value;
        this.witness.push(value);
        return t;
    }

    addMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.ADDMOD, target, [a, b]);
        let v = (a.value + b.value) % prime_bigint;
        this.setRegister(target, v);
    }

    subMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.SUB, target, [a, b]);
        let v = (prime_bigint + a.value - b.value) % prime_bigint;
        this.setRegister(target, v);
    }

    andBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDBIT, target, [a, b], BigInt(bit));
        const v = !!(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    andNotBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDNOTBIT, target, [a, b], BigInt(bit));
        const v = !(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    mov(target: Register, a: Register) {
        this.setRegister(target, a.value);
    }

    equal(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.EQUAL, target, [a, b]);
        this.setRegister(target, a.value === b.value ? 1n : 0n);
    }

    mulMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.MULMOD, target, [a, b]);
        this.setRegister(target, (a.value * b.value) % prime_bigint);
    }

    or(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.OR, target, [a, b]);
        this.setRegister(target, !!a.value || !!b.value ? 1n : 0n);
    }

    and(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.AND, target, [a, b]);
        this.setRegister(target, !!a.value && !!b.value ? 1n : 0n);
    }

    not(target: Register, a: Register) {
        this.pushInstruction(InstrCode.AND, target, [a]);
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
        this.pushInstruction(InstrCode.DIVMOD, target, [a, b]);
        this.setRegister(target, v);
    }

    ignoreFailure(a: () => void) {
        let f = this.success;
        a();
        this.success = f;
    }

    ignoreFailureInExactlyOne(a: () => void, b: () => void) {
        let count = 0;
        let f = this.success;
        a();
        count += this.success ? 0 : 1;
        this.success = true;
        b();
        count += this.success ? 0 : 1;
        this.success = count == 1;
    }

    assertEqZero(v: Register) {
        this.mov(this.R_0, v);
    }

    assertEqOne(v: Register) {
        this.mov(this.R_1, v);
    }

    assertEq(a: Register, b: Register) {
        const temp = this.state.newRegister();
        this.equal(temp, a, b);
        this.assertEqOne(temp);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = this.state.newRegister();
        this.andBit(t1, f, 0, a);
        const notF = this.state.newRegister();
        this.addMod(notF, f, this.R_1);
        const t2 = this.state.newRegister();
        this.andBit(t2, notF, 0, b);
        this.addMod(target, t1, t2);
    }

    /// *** HIGH LEVEL *** ///

    public initHardcoded(hardcoded: bigint[]): Register[] {
        return hardcoded.map(n => this.hardcode(n));
    }

    public initWitness(withness: bigint[]): Register[] {
        return withness.map(n => this.addWitness(n));
    }

    public optimizeRegs() {
        regOptimizer(this);
    }

    public save(): SavedVm<InstrCode> {
        return {
            hardcoded: this.hardcoded.map(r => r.toString(16)),
            witness: this.witness.map(r => r.toString(16)),
            registers: this.state.registers.length,
            programLength: this.instructions.length,
            program: this.instructions.map(instr => ({
                name: instr.name,
                target: instr.target.index,
                params: instr.params.map(r => r.index),
                data: instr.data?.toString(16),
            })),
        };
    }
}

export const vm = new VM();
