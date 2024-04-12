import { Register, State } from "./state";
import { Logger } from 'sitka';
import { Witness } from "./witness";
import { modInverse } from "../common/math-utils";

export enum InstrCode {
    ADDMOD = "ADDMOD",
    ANDBIT = "ANDBIT",
    MOV = "MOV",
    EQUAL = "EQUAL"
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

    constructor() {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.witness = new Witness();
        this.state = new State();
        this.R_R = this.state.hardcodedWithIndex(-1, 0n);
        this.R_0 = this.state.hardcodedWithIndex(0, 0n);
        this.R_1 = this.state.hardcodedWithIndex(1, 1n);
        this.R_2 = this.state.hardcodedWithIndex(2, 2n);
        this.R_P0 = this.state.hardcoded(0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn);
    }

    /// *** BASIC OPERATIONS ***

    addWitness(value: bigint) {
        this.witness.set(this.current, value);
    }

    setInstruction(name: InstrCode, target: Register, params: Register[], bit?: number) {
        //this.instructions[this.current] = { name, target, params, bit: bit };
        this.current++;
        if (this.current % 1000000 == 0) {
            //console.log(`line number: ${this.current}   registers: ${this.state.highestIndex}`);
        }
    }

    newRegister(): Register {
        return this.state.newRegister();
    }

    hardcoded(value: bigint): Register {
        return this.state.hardcoded(value);
    }

    getJson() {
        return {
            // instructions:
            //     this.instructions.map(instr => ({
            //         ...instr,
            //         target: instr.target.index,
            //         params: instr.params.map(p => p.index)
            //     })),
            instrCount: this.instructions.length,
            //state: this.state.getJson(),
            //witness: this.witness.getJson()
        };
    }

    print() {
        const str = JSON.stringify(this.getJson(), null, 4);
        console.log(str);
    }

    reset() {

        this.state = new State();
        this.witness = new Witness();
        this.instructions = [];
        this.current = 0;
    }

    /// *** BASIC INSTRUCTIONS *** ///

    add(target: Register, a: Register, b: Register, prime: Register) {
        this.setInstruction(InstrCode.ADDMOD, target, [a, b, prime]);
        let v = (a.value + b.value) % prime.value;
        target.setValue(v);
    }

    andbit(target: Register, a: Register, bit: number, b: Register) {
        this.setInstruction(InstrCode.ANDBIT, target, [a, b], bit);
        const v = a.value & (2n ** BigInt(bit));
        target.setValue(v ? b.value : 0n);
    }

    mov(target: Register, a: Register) {
        if (a === this.R_R) {
            target.setValue(this.witness.get(this.current).value);
        } else {
            target.setValue(a.value);
        }
    }

    equal(target: Register, a: Register, b: Register) {
        target.setValue(a.value === b.value ? 1n : 0n);
        this.setInstruction(InstrCode.EQUAL, target, [a, b]);
    }

    /// *** UTILITY INSTRUCTIONS *** ///

    load(target: Register, value: bigint) {
        this.addWitness(value);
        this.mov(target, this.R_R);
    }

    sub(target: Register, a: Register, b: Register, prime: Register) {
        const v = (prime.value + a.value - b.value) % prime.value;
        this.load(target, v);
        const temp = this.state.newRegister();
        this.add(temp, b, target, prime);
        this.assertEq(temp, a);
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

    or(target: Register, a: Register, b: Register) {
        target.setValue(!!a.value || !!b.value ? 1n : 0n);
        const temp = this.newRegister();
        this.add(temp, a, b, this.R_P0);
        this.equal(target, temp, this.R_0);
        this.not(target, target);
    }

    and(target: Register, a: Register, b: Register) {
        target.setValue(!!a.value && !!b.value ? 1n : 0n);
        const temp = this.newRegister();
        this.add(temp, a, b, this.R_P0);
        this.equal(target, temp, this.R_2);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = this.state.newRegister();
        this.andbit(t1, f, 0, a);
        const notF = this.state.newRegister();
        this.add(notF, f, this.R_1, this.R_P0);
        const t2 = this.state.newRegister();
        this.andbit(t2, notF, 0, a);
        this.add(target, t1, t2, this.R_P0);
    }

    not(target: Register, f: Register) {
        this.ifThenElse(target, f, this.R_0, this.R_1);
    }

    mul(target: Register, a: Register, b: Register, prime: Register) {
        if (a.hardcoded && b.hardcoded) {
            this.mov(target, this.hardcoded(a.getValue() * b.getValue() % prime.getValue()));
            return;
        }
        const agg = this.state.newRegister();
        this.mov(agg, a);
        const r_temp = this.state.newRegister();
        this.mov(target, this.R_0);
        for (let bit = 0; bit < 256; bit++) {
            const bv = b.getValue() >> BigInt(bit) & 1n;
            if (!b.hardcoded || bv) {
                vm.andbit(r_temp, b, bit, agg);
                vm.add(target, target, r_temp, prime);
            }
            if (bit < 255) vm.add(agg, agg, agg, prime);
        }
    }

    inverse(target: Register, a: Register, prime: Register) {
        let v = 0n;
        try {
            v = modInverse(a.value, prime.value) as bigint;
        } catch (e) {
            // Divide by zero. Return 0 because we can't fail here.
        }
        if(a.hardcoded) {
            this.mov(target, this.hardcoded(v));
            return;
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
        v = (a.getValue() * v) % prime.getValue();
        this.load(target, v);
        const temp = this.state.newRegister();
        this.mul(temp, b, target, prime);
        this.assertEq(temp, a);
    }
}

export const vm = new VM();
