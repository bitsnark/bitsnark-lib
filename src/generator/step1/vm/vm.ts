import { modInverse } from "../../common/math-utils";
import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { State } from "../../common/state";
import { prime_bigint } from "./prime";
import { regOptimizer } from "./reg-optimizer";
import { Instruction, InstrCode } from "./types";

export class VM {

    zero: Register;
    one: Register;
    
    state: State;
    witness: bigint[] = [];
    hardcodedCache: any = {};
    instructions: Instruction[] = [];
    instrCounter = 0;
    success = true;

    constructor() {
        this.state = new State();
        this.zero = this.hardcode(0n);
        this.one = this.hardcode(1n);
    }

    /// *** BASIC OPERATIONS ***

    private pushInstruction(name: InstrCode, target: Register, param1?: Register, param2?: Register, data?: bigint) {
        this.instructions.push({ name, target: target.index, param1: param1?.index, param2: param2?.index, data });
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
        this.success = false;
        try {
            throw new Error(msg);
        } catch (e) {
            console.error(e);
        }
    }

    /// *** BASIC INSTRUCTIONS *** ///

    public newRegister(reset?: boolean): Register {
        const t = this.state.newRegister();
        if (reset) this.pushInstruction(InstrCode.MOV, t, undefined, undefined, 0n);
        return t;
    }

    public hardcode(value: bigint): Register {

        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');
        let t = this.hardcodedCache[value.toString(16)];
        if (t) return t;

        if (this.instructions.length > 0 || this.witness.length > 0)
            throw new Error('Hardcoded first please');

        t = this.state.newRegister(value);
        t.hardcoded = true;
        this.hardcodedCache[value.toString(16)] = t;
        return t;
    }

    public addWitness(value: bigint): Register {

        if (this.instructions.length > 0) throw new Error('Witness second please');
        if (value < 0 || value >= 2n ** 256n) throw new Error('Invalid value');
        
        const t = this.state.newRegister(value);
        t.value = value;
        t.witness = true;
        this.witness.push(value);
        return t;
    }

    // public freeRegs(...ra: Register[]) {
    //     ra.forEach(r => this.state.freeRegister(r));
    // }

    public gcEnter() {
        this.state.gcEnter();
    }

    public gcExit(toKeep: Register[]) {
        this.state.gcExit(toKeep);
    }

    //****      ******/

    addMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.ADDMOD, target, a, b);
        let v = (a.value + b.value) % prime_bigint;
        this.setRegister(target, v);
    }

    subMod(target: Register, a: Register, b: Register) {
        this.pushInstruction(InstrCode.SUB, target, a, b);
        let v = (prime_bigint + a.value - b.value) % prime_bigint;
        this.setRegister(target, v);
    }

    andBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDBIT, target, a, b, BigInt(bit));
        const v = !!(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    andNotBit(target: Register, a: Register, bit: number, b: Register) {
        this.pushInstruction(InstrCode.ANDNOTBIT, target, a, b, BigInt(bit));
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
        this.pushInstruction(InstrCode.AND, target, a);
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

    assertEqZero(r: Register) {
        this.pushInstruction(InstrCode.ASSERTZERO, r);
        if (r.value != 0n) this.fail('assert zero');
    }

    assertEqOne(r: Register) {
        this.pushInstruction(InstrCode.ASSERTONE, r);
        if (r.value != 1n) this.fail('assert one');
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

    assertEq(a: Register, b: Register) {
        const temp = this.state.newRegister();
        this.equal(temp, a, b);
        this.assertEqOne(temp);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = this.state.newRegister();
        this.andBit(t1, f, 0, a);
        const notF = this.state.newRegister();
        this.addMod(notF, f, this.one);
        const t2 = this.state.newRegister();
        this.andBit(t2, notF, 0, b);
        this.addMod(target, t1, t2);
    }

    /// *** HIGH LEVEL *** ///

    public reset() {
        this.instructions = [];
        this.state.reset();
        this.witness = [];
        this.instrCounter = 0;
        this.success = true;
    }

    public optimizeRegs() {
        regOptimizer(this);
    }

    public save(): SavedVm<InstrCode> {
        return {
            hardcoded: this.state.registers.filter(r => r.hardcoded).map(r => r.value.toString(16)),
            witness: this.witness.map(r => r.toString(16)),
            registers: this.state.registers.length,
            programLength: this.instructions.length,
            program: this.instructions.map(instr => ({
                name: instr.name,
                target: instr.target,
                param1: instr.param1,
                param2: instr.param2,
                data: instr.data?.toString(16),
            })),
        };
    }
}

export const vm = new VM();
