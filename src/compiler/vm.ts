import { R_0, R_1, Registers } from "./registers";
import { Logger } from 'sitka';
import { Witness } from "./witness";

export const R_R = -1;

enum InstrCode {
    ADD = "ADD",
    SUB = "SUB",
    ANDBIT = "ANDBIT",
    MOV = "MOV",
    EQUAL = "EQUAL"
}

interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
}

export class VM {

    logger: Logger;
    prime: bigint;
    registers: Registers;
    witness: Witness;
    instructions: Instruction[] = [];
    current: number = 0;

    constructor(prime: bigint) {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.prime = prime;
        this.witness = new Witness();
        this.registers = new Registers();
    }

    /// *** BASIC OPERATIONS ***

    getRegister(rid: number): bigint {
        if (rid == R_R) return this.witness.get(this.current).value;
        return this.registers.get(rid);
    }

    setRegister(rid: number, value: bigint) {
        if (rid == R_R) {
            if (this.witness.get(this.current).value != value) throw new Error(`Assertion failed, line: ${this.current}`);
        } else {
            this.registers.set(rid, value);
        }
    }

    addWitness(value: bigint, title: string) {
        this.witness.set(this.current, value, title);
    }

    setInstruction(name: InstrCode, target: number, params: number[]) {
        this.instructions[this.current] = { name, target, params };
    }

    print() {
        console.log('*** PROGRAM ***');
        for (let i = 0; i < this.instructions.length; i++) {
            const instr = this.instructions[i];
            console.log(`${i}: ${instr.name} ${instr.target} ${instr.params}`);
        }

        this.witness.print();
        this.registers.print();
    }

    enterFunction() {
        this.registers.enterf();
    }

    exitFunction() {
        this.registers.exitf();
    }

    allocateRegister() {
        const r = this.registers.allocate();
        this.mov(r, R_0);
        return r;
    }

    /// *** BASIC INSTRUCTIONS *** ///

    add(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.ADD, r_target, [r_a, r_b]);
        let v = (this.registers.get(r_a) + this.registers.get(r_b)) % this.prime;
        this.setRegister(r_target, v);

        this.current++;
    }

    andbit(r_target: number, r_a: number, b: number, r_c: number) {
        this.setInstruction(InstrCode.ANDBIT, r_target, [r_a, b, r_c]);
        const v = this.registers.get(r_a) & (2n ** BigInt(b));
        this.registers.set(r_target, v ? this.registers.get(r_c) : 0n);

        this.current++;
    }

    mov(r_target: number, r_a: number) {
        this.setInstruction(InstrCode.MOV, r_target, [r_a]);
        const v = this.getRegister(r_a);
        this.setRegister(r_target, v);

        this.current++;
    }

    equal(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.EQUAL, r_target, [r_a, r_b]);
        const a = this.getRegister(r_a);
        const b = this.getRegister(r_b);
        this.setRegister(r_target, a === b ? 1n : 0n);

        this.current++;
    }

    /// *** UTILITY INSTRUCTIONS *** ///

    load(r_target: number, value: bigint, title: string) {
        this.addWitness(value, title);
        this.mov(r_target, R_R);
    }

    sub(r_target: number, r_a: number, r_b: number) {
        this.enterFunction();
        const v = (this.prime + this.getRegister(r_a) - this.getRegister(r_b)) % this.prime;
        const r_result = this.allocateRegister();
        this.load(r_result, v, 'sub');
        const r_t = this.allocateRegister();
        this.add(r_t, r_result, r_b);
        this.assertEq(r_t, r_a);
        this.mov(r_target, r_result);
        this.exitFunction();
    }

    assertEq(r_a: number, r_b: number) {
        this.enterFunction();
        const r_t = this.allocateRegister();
        this.equal(r_t, r_a, r_b);
        this.mov(R_1, r_t);
        this.exitFunction();
    }

    ifThenElse(r_target: number, r_f: number, r_a: number, r_b: number) {
        this.enterFunction();
        const r_t1 = this.allocateRegister();
        this.andbit(r_t1, r_f, 0, r_a);
        const r_t2 = this.allocateRegister();
        const r_n = this.allocateRegister();
        this.add(r_n, r_f, R_1);
        this.andbit(r_t2, r_n, 0, r_b);
        this.add(r_target, r_t1, r_t2);
        this.exitFunction();
    }
}
