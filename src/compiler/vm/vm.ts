import { R_0, R_1, R_R, Register, state } from "./state";
import { Logger } from 'sitka';
import { Witness } from "./witness";
import { modInverse } from "../math-utils";

enum InstrCode {
    ADDMOD = "ADDMOD",
    ANDBIT = "ANDBIT",
    MOV = "MOV",
    EQUAL = "EQUAL",
    NOT = "NOT"
}

interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
}

export const R_P0 = Register.hardcoded('R_P0', 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn);

export class VM {

    static R_R = R_R;
    static R_0 = R_0;
    static R_1 = R_1;

    logger: Logger;
    witness: Witness;
    instructions: Instruction[] = [];
    current: number = 0;

    constructor() {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.witness = new Witness();
    }

    /// *** BASIC OPERATIONS ***

    addWitness(value: bigint, title: string) {
        this.witness.set(this.current, value, title);
    }

    setInstruction(name: InstrCode, target: number, params: number[]) {
        this.instructions[this.current] = { name, target, params };
    }

    getJson() {
        return {
            instructions: this.instructions,
            instrCount: this.instructions.length,
            state: state.getJson(),
            witness: this.witness.getJson()
        };
    }

    print() {
        const str = JSON.stringify(this.getJson(), null, 4);
        console.log(str);
    }

    /// *** BASIC INSTRUCTIONS *** ///

    add(target: Register, a: Register, b: Register, prime: Register) {
        this.setInstruction(InstrCode.ADDMOD, target.index, [a.index, b.index, prime.index]);
        let v = (a.value + b.value) % prime.value;
        target.setValue(v);

        this.current++;
    }

    andbit(target: Register, a: Register, b: number, c: Register) {
        this.setInstruction(InstrCode.ANDBIT, target.index, [a.index, b, c.index]);
        const v = a.value & (2n ** BigInt(b));
        target.setValue(v ? c.value : 0n);

        this.current++;
    }

    mov(target: Register, a: Register) {
        if (a === R_R) {
            target.setValue(this.witness.get(this.current).value);
        } else {
            target.setValue(a.value);
        }

        this.setInstruction(InstrCode.MOV, target.index, [a.index]);
        this.current++;
    }

    not(target: Register, a: Register) {
        target.setValue(a.value === 0n ? 1n : 0n);

        this.setInstruction(InstrCode.NOT, target.index, [a.index]);
        this.current++;
    }

    equal(target: Register, a: Register, b: Register) {
        target.setValue(a.value === b.value ? 1n : 0n);

        this.setInstruction(InstrCode.EQUAL, target.index, [a.index, b.index]);
        this.current++;
    }

    notEqual(target: Register, a: Register, b: Register) {
        target.setValue(a.value === b.value ? 1n : 0n);

        this.setInstruction(InstrCode.EQUAL, target.index, [a.index, b.index]);
        this.setInstruction(InstrCode.NOT, target.index, [target.index]);
        this.current += 2;
    }

    /// *** UTILITY INSTRUCTIONS *** ///

    load(target: Register, value: bigint, title: string) {
        this.addWitness(value, title);
        this.mov(target, VM.R_R);
    }

    sub(target: Register, a: Register, b: Register, prime: Register) {
        const v = (prime.value + a.value - b.value) % prime.value;
        this.load(target, v, 'sub');
        const temp = new Register();
        this.add(temp, b, target, prime);
        this.assertEq(temp, a);
    }

    assertEqZero(v: Register) {
        this.mov(R_0, v);
    }

    assertEqOne(v: Register) {
        this.mov(R_1, v);
    }

    assertEq(a: Register, b: Register) {
        const temp = new Register();
        this.equal(temp, a, b);
        this.assertEqOne(temp);
    }

    ifThenElse(target: Register, f: Register, a: Register, b: Register) {
        const t1 = new Register();
        this.andbit(t1, f, 0, a);
        const notF = new Register();
        this.add(notF, f, R_1, R_P0);
        const t2 = new Register();
        this.andbit(t2, notF, 0, a);
        this.add(target, t1, t2, R_P0);
    }

    mul(target: Register, a: Register, b: Register, prime: Register) {
        const agg = new Register();
        this.mov(agg, a);
        const r_temp = new Register();
        this.mov(target, R_0);
        for (let bit = 0; bit < 256; bit++) {
            vm.andbit(r_temp, b, bit, agg);
            vm.add(target, target, r_temp, prime);
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
        this.load(target, v, 'inverse');
        const temp = new Register();
        this.mul(temp, a, target, prime);
        this.assertEqOne(temp);
    }

    div(target: Register, a: Register, b: Register, prime: Register) {
        const inv = new Register();
        this.inverse(inv, b, prime);
        this.mul(target, a, inv, prime);
    }
}

export const vm = new VM();

