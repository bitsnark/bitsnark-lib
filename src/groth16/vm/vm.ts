import { Register, State } from "./state";
import { Logger } from 'sitka';
import { Witness } from "./witness";
import { modInverse } from "../common/math-utils";

export enum InstrCode {
    ADDMOD,
    ANDBIT,
    IFBIT,
    MOV,
    EQUAL,
    MULMOD,
    OR,
    AND,
    NOT,
    SUB,
    SUBMOD,
    DIVMOD
}

export interface Instruction {
    name: InstrCode;
    target: Register;
    bit?: number;
    params: Register[];
}

export class VM {

    R_R: Register;
    R_0: Register;
    R_1: Register;
    R_2: Register;
    R_P0: Register;

    logger: Logger;
    state: State;
    witness: Witness;
    instructions: Instruction[] = [];
    current: number = 0;
    collectInstructions = false;

    constructor() {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.witness = new Witness();
        this.state = new State();
        this.R_R = this.state.hardcoded(0n);
        this.R_0 = this.state.hardcoded(0n);
        this.R_1 = this.state.hardcoded(1n);
        this.R_2 = this.state.hardcoded(2n);
        this.R_P0 = this.state.hardcoded(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn);
    }

    setCollectInstructions(f: boolean) {
        this.collectInstructions = f;
    }

    getCurrentInstruction(): number {
        return this.current;
    }

    /// *** BASIC OPERATIONS ***

    addWitness(value: bigint) {
        this.witness.set(this.current, value);
    }

    setInstruction(name: InstrCode, target: Register, params: Register[], bit?: number) {

        if (this.collectInstructions) {
            this.instructions[this.current] = { name, target, params, bit: bit };
        }

        this.current++;
        if (this.current % 1000000 == 0) {
            console.log(`line number: ${this.current} \t register count: ${Object.keys(this.state.registerMap).length}`);
        }
    }

    newRegister(): Register {
        return this.state.newRegister();
    }

    hardcoded(value: bigint): Register {
        if (value >= 2n ** 256n) throw new Error('Too big');
        return this.state.hardcoded(value);
    }

    getJson() {
        return {
            // program: this.instructions.map(instr => 
            //     `${instr.name} ${instr.target.index} ${instr.params.map(r => r.index).join(',')} ${instr.bit ? instr.bit : ''}`),
            state: this.state.getJson(),
            witness: this.witness.getJson(),
            instrCount: this.instructions.length,
        };
    }

    reset() {
        this.state = new State();
        this.witness = new Witness();
        this.instructions = [];
        this.current = 0;
    }

    /// *** BASIC INSTRUCTIONS *** ///

    add(target: Register, a: Register, b: Register, prime: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.ADDMOD, target, [a, b, prime]);
        let v = (a.value + b.value) % prime.value;
        this.setRegister(target, v);
    }

    sub(target: Register, a: Register, b: Register, prime: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.SUB, target, [a, b, prime]);
        let v = (prime.value + a.value - b.value) % prime.value;
        this.setRegister(target, v);
    }

    andbit(target: Register, a: Register, bit: number, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.ANDBIT, target, [a, b], bit);
        const v = !!(a.value & (2n ** BigInt(bit)));
        this.setRegister(target, v ? b.value : 0n);
    }

    mov(target: Register, a: Register) {
        if (a === this.R_R) {
            this.setRegister(target, this.witness.get(this.current).value);
        } else {
            this.setRegister(target, a.value);
        }
    }

    equal(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setRegister(target, a.value === b.value ? 1n : 0n);
        this.setInstruction(InstrCode.EQUAL, target, [a, b]);
    }

    ifBit(target: Register, flag: Register, bit: number, value: Register, other: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.IFBIT, target, [flag, value, other], bit);
        const f = !!(flag.value & (2n ** BigInt(bit)));
        this.setRegister(target, f ? value.value : other.value);
    }

    mul(target: Register, a: Register, b: Register, prime: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.MULMOD, target, [a, b, prime]);
        target.value = (a.value * b.value) % prime.value;
    }

    or(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setRegister(target, !!a.value || !!b.value ? 1n : 0n);
        this.setInstruction(InstrCode.OR, target, [a, b]);
    }

    and(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setRegister(target, !!a.value && !!b.value ? 1n : 0n);
        this.setInstruction(InstrCode.AND, target, [a, b]);
    }

    not(target: Register, a: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setRegister(target, !a.value ? 1n : 0n);
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    /// *** UTILITY INSTRUCTIONS *** ///

    load(target: Register, value: bigint) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.addWitness(value);
        this.mov(target, this.R_R);
    }

    ignoreFailure(a: () => void) {
        let f = this.isFailed();
        a();
        this.state.failed = f;
    }

    ignoreFailureInExactlyOne(a: () => void, b: () => void) {
        let f = this.isFailed() ? 1 : 0;
        this.state.failed = false;
        a();
        f += this.isFailed() ? 1 : 0;
        this.state.failed = false;
        b();
        f += this.isFailed() ? 1 : 0;
        this.state.failed = f == 1;
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

    setRegister(r: Register, v: bigint) {
        if (r.hardcoded && r.value !== v) {
            this.state.setFailed();
        }
        r.value = v;
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = this.state.newRegister();
        this.andbit(t1, f, 0, a);
        const notF = this.state.newRegister();
        this.add(notF, f, this.R_1, this.R_P0);
        const t2 = this.state.newRegister();
        this.andbit(t2, notF, 0, b);
        this.add(target, t1, t2, this.R_P0);
    }

    inverse(target: Register, a: Register, prime: Register) {
        let v = 0n;
        try {
            v = modInverse(a.value, prime.value) as bigint;
        } catch (e) {
            // Divide by zero. Return 0 because we can't fail here.
        }
        this.load(target, v);
        const temp = this.state.newRegister();
        this.mul(temp, a, target, prime);
        this.assertEqOne(temp);
    }

    div(target: Register, a: Register, b: Register, prime: Register) {
        let v = 0n;
        try {
            v = modInverse(b.value, prime.value) as bigint;
        } catch (e) {
            // Divide by zero. Return 0 because we can't fail here.
        }
        v = (a.value * v) % prime.value;
        this.load(target, v);
        const temp = this.state.newRegister();
        this.mul(temp, b, target, prime);
        this.assertEq(temp, a);
    }

    isFailed(): boolean {
        return this.state.failed;
    }
}

export const vm = new VM();
