import { Register, State } from "./state";
import { Logger } from 'sitka';

export enum InstrCode {
    DATA,
    ADD,
    AND,
    XOR,
    NOT,
    SHR,
    ROTR,
    MOV,
    ASSERTEQ
}

export interface Instruction {
    name: InstrCode;
    target: Register;
    params: Register[];
    data?: bigint;
}

export class VM {

    logger: Logger;
    state: State;
    instructions: Instruction[] = [];
    current: number = 0;
    witness: any[] = [];
    success = true;

    constructor() {
        this.logger = Logger.getLogger({ name: this.constructor.name });
        this.state = new State();
    }

    getCurrentInstruction(): number {
        return this.current;
    }

    addWitness(value: bigint): Register {
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        const t = this.newRegister();
        t.value = value;
        this.witness.push([ t.key, t.value ]);
        return t;
    }

    hardcode(value: bigint): Register {
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        const t = this.newRegister();
        t.value = value;
        t.hardcoded = true;
        this.setInstruction(InstrCode.DATA, t, [], value);
        return t;
    }

    newRegister(value?: bigint): Register {
        const t = this.state.newRegister();
        if (value) {
            if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
            this.setInstruction(InstrCode.DATA, t, [], value);
            t.value = value;
        }
        return t;
    }

    setInstruction(name: InstrCode, target: Register, params: Register[], data?: bigint) {

        this.instructions[this.current] = { name, target, params, data };
        this.current++;
    }

    getJson() {
        return {
            program: this.instructions.map(instr => 
                 `${instr.name} ${instr.target.key} ${instr.params.map(r => r.key).join(',')}`),
            state: this.state.getJson(),
            instrCount: this.instructions.length,
        };
    }

    reset() {
        this.state = new State();
        this.instructions = [];
        this.current = 0;
    }


    /// *** BASIC INSTRUCTIONS *** ///

    add(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        this.setInstruction(InstrCode.ADD, target, [a, b]);
        target.value = (a.value + b.value) % 2n ** 32n ;
    }

    and(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        target.value = a.value & b.value;
        this.setInstruction(InstrCode.AND, target, [a, b]);
    }

    not(target: Register, a: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        target.value = ~a.value;
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    shr(target: Register, a: Register, n: number) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        target.value = a.value >> BigInt(n)
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    rotr(target: Register, a: Register, _n: number) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        const n = BigInt(_n);
        const a1 = a.value & (2n ** n - 1n);
        target.value = a.value >> n | (a1 << (32n - n));
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    xor(target: Register, a: Register, b: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        target.value = a.value ^ b.value;
        this.setInstruction(InstrCode.XOR, target, [a]);
    }

    mov(target: Register, a: Register) {
        if (target.hardcoded) throw new Error("Can't write to hardcoded");
        target.value = a.value;
        this.setInstruction(InstrCode.MOV, target, [a]);
    }

    assertEqual(a: Register, b: Register) {
        if (this.success) this.success = a.value == b.value;
    }
}

export const vm = new VM();
