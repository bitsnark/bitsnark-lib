import { R_0, Registers } from "./registers";
import { Logger } from 'sitka';
import { Witness } from "./witness";

enum InstrCode {
    ADD = "ADD",
    ADD1 = "ADD1",
    ADD2 = "ADD2",
    ANDBIT = "ANDBIT",
    MOV = "MOV",
    EQ = "EQ",
    SUB = "SUB"
}

interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
}

export const R_R = -1;

export class VM {

    logger: Logger;
    registers: Registers;
    witness: Witness;
    m1: bigint = 0n;
    m2: bigint = 0n;
    instructions: Instruction[] = [];
    current: number = 0;

	constructor(m1: bigint, m2: bigint) {
		this.logger = Logger.getLogger({ name: this.constructor.name });
        this.m1 = m1;
        this.m2 = m2;
        this.witness = new Witness();
        this.registers = new Registers();
	}

    /// *** BASIC OPERATIONS ***

    getRegister(rid: number): bigint {
        if(rid == R_R) return this.witness.get(this.current).value;
        return this.registers.get(rid);
    }

    setRegister(rid: number, value: bigint) {
        if(rid == R_R) {
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
        for(let i = 0; i < this.instructions.length; i++) {
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
        this.setInstruction(InstrCode.ADD1, r_target, [ r_a, r_b ]);
        const v = (this.registers.get(r_a) + this.registers.get(r_b));
        this.setRegister(r_target, v);

        this.current++;
    }

    add1(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.ADD1, r_target, [ r_a, r_b ]);
        const v = (this.registers.get(r_a) + this.registers.get(r_b)) % this.m1;
        this.setRegister(r_target, v);

        this.current++;
    }

    add2(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.ADD2, r_target, [ r_a, r_b ]);
        const v = (this.registers.get(r_a) + this.registers.get(r_b)) % this.m2;
        this.setRegister(r_target, v);

        this.current++;
    }

    sub(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.SUB, r_target, [ r_a, r_b ]);
        const v = (this.registers.get(r_a) - this.registers.get(r_b));
        this.setRegister(r_target, v);

        this.current++;
    }

    andbit(r_target: number, r_a: number, b: number, r_c: number) {
        this.setInstruction(InstrCode.ANDBIT, r_target, [ r_a, b, r_c ]);
        const v = this.registers.get(r_a) & (2n ** BigInt(b));
        this.registers.set(r_target, v ? this.registers.get(r_c) : 0n);

        this.current++;
    }

    mov(r_target: number, r_a: number) {
        this.setInstruction(InstrCode.MOV, r_target, [ r_a ]);
        const v = this.getRegister(r_a);
        this.setRegister(r_target, v);

        this.current++;
    }

    eq(r_target: number, r_a: number, r_b: number) {
        this.setInstruction(InstrCode.EQ, r_target, [ r_a, r_b ]);
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

    sub1(r_target: number, r_a: number, r_b: number) {
        this.enterFunction();
        const v = (this.m1 + this.getRegister(r_a) - this.getRegister(r_b)) % this.m1;
        const r_result = this.allocateRegister();
        this.load(r_result, v, 'sub1');
        const r_t = this.allocateRegister();
        this.add1(r_t, r_result, r_b);
        this.assertEq(r_t, r_a);
        this.mov(r_target, r_result);
        this.exitFunction();        
    }

    assertEq(r_a: number, r_b: number) {
        this.enterFunction();
        const r_t = this.allocateRegister();
        this.sub(r_t, r_a, r_b);
        this.mov(R_0, r_t);
        this.exitFunction();        
    }

    boolNot(r_target: number, r_id: number) {
        this.eq(r_target, r_id, 0);
    }

    ifThenElse(r_target: number, r_f: number, r_a: number, r_b: number) {
        this.enterFunction();
        const r_t1 = this.allocateRegister();
        this.andbit(r_t1, r_f, 0, r_a);
        const r_t2 = this.allocateRegister();
        const r_n = this.allocateRegister();
        this.boolNot(r_n, r_f);
        this.andbit(r_t2, r_n, 0, r_b);
        this.add(r_target, r_t1, r_t2);
        this.exitFunction();
    }
}
