import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { State } from "../../common/state";
import { Instruction, InstrCode } from "./types";

export class VM {

    state: State;
    instructions: Instruction[] = [];
    success = true;
    hardcodedCache: any = {};
    hardcoded: Register[] = [];
    witness: Register[] = [];

    constructor() {
        this.state = new State();
    }

    private addWitness(value: bigint): Register {
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        const t = this.newRegister(value);
        this.witness.push(t);
        return t;
    }

    private hardcode(value: bigint): Register {
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        let t = this.hardcodedCache[value.toString(16)];
        if (t) return t;
        t = new Register();
        t.value = value;
        t.hardcoded = true;
        this.hardcodedCache[value.toString(16)] = t;
        this.hardcoded.push(t);
        return t;
    }

    private validateTarget(r: Register) {
        if (r.index < 0 || r.hardcoded) throw new Error('Invalid register');
    }

    private setInstruction(name: InstrCode, target: Register, params: Register[], data?: bigint) {
        this.instructions.push({ name, target: target.index, params: params.map(r => r.index), data });
    }

    /******  PUBLIC  *******/

    newRegister(value?: bigint): Register {
        const t = this.state.newRegister();
        value = value ?? 0n;
        if (value < 0 || value >= 2n ** 32n) throw new Error('Invalid value');
        t.value = value;
        if (value != 0n) {
            this.setInstruction(InstrCode.DATA, t, [], value);
        }
        return t;
    }

    /// *** BASIC INSTRUCTIONS *** ///

    data(target: Register, data: bigint) {
        if (data < 0 || data >= 2n ** 32n) throw new Error('Invalid value');
        this.validateTarget(target);
        this.setInstruction(InstrCode.DATA, target, [], data);
        target.value = data;
    }

    add(target: Register, a: Register, b: Register) {
        this.validateTarget(target);
        this.setInstruction(InstrCode.ADD, target, [a, b]);
        target.value = (a.value + b.value) % 2n ** 32n;
    }

    and(target: Register, a: Register, b: Register) {
        this.validateTarget(target);
        target.value = a.value & b.value;
        this.setInstruction(InstrCode.AND, target, [a, b]);
    }

    not(target: Register, a: Register) {
        this.validateTarget(target);
        target.value = ~a.value;
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    shr(target: Register, a: Register, n: number) {
        this.validateTarget(target);
        target.value = a.value >> BigInt(n)
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    rotr(target: Register, a: Register, _n: number) {
        this.validateTarget(target);
        const n = BigInt(_n);
        const a1 = a.value & (2n ** n - 1n);
        target.value = a.value >> n | (a1 << (32n - n));
        this.setInstruction(InstrCode.AND, target, [a]);
    }

    xor(target: Register, a: Register, b: Register) {
        this.validateTarget(target);
        target.value = a.value ^ b.value;
        this.setInstruction(InstrCode.XOR, target, [a]);
    }

    mov(target: Register, a: Register) {
        this.validateTarget(target);
        target.value = a.value;
        this.setInstruction(InstrCode.MOV, target, [a]);
    }

    assertEqual(a: Register, b: Register) {
        if (this.success) this.success = a.value == b.value;
    }

    /*********   High level operations *********/

    initHardcoded(hardcoded: bigint[]): Register[] {
        return hardcoded.map(n => this.hardcode(n));
    }

    initWitness(withness: bigint[]): Register[] {
        return withness.map(n => this.addWitness(n));
    }

    save(): SavedVm<InstrCode> {
        return {
            hardcoded: this.hardcoded.map(r => r.value.toString(16)),
            witness: this.witness.map(r => r.value.toString(16)),
            registers: this.state.registers.length,
            programLength: this.instructions.length,
            program: this.instructions.map(instr => ({
                name: instr.name,
                target: instr.target,
                params: instr.params,
                data: instr.data?.toString(16),
            })),
        };
    }
}

export const vm = new VM();
