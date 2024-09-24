import { calculateMerkleRoot } from "../../../encoding/merkle";
import { modInverse } from "../../common/math-utils";
import { prime_bigint } from "../../common/prime";
import { Register } from "../../common/register";
import { SavedVm } from "../../common/saved-vm";
import { Instruction, InstrCode } from "./types";

export class Runner {

    registers: Register[] = [];
    witness: bigint[] = []
    hardcoded: bigint[] = []
    instructions: Instruction[] = [];
    current: number = 0;
    successIndex: number = 0;

    private constructor() {
    }

    private hardcode(value: bigint): Register {
        const r = {
            value,
            hardcoded: true,
            witness: false,
            bool: false,
            index: this.registers.length
        };
        this.registers.push(r);
        return r;
    }

    private addWitness(value: bigint): Register {
        const r = {
            value,
            hardcoded: false,
            witness: true,
            bool: false,
            index: this.registers.length
        };
        this.registers.push(r);
        return r;
    }

    public static load(obj: SavedVm<InstrCode>): Runner {
        const runner = new Runner();
        runner.hardcoded = obj.hardcoded.map((ns: string) => BigInt('0x' + ns));
        runner.witness = obj.witness.map((ns: string) => BigInt('0x' + ns));
        runner.instructions = obj.program.map(inst => ({
            name: inst.name,
            target: inst.target,
            param1: inst.param1!,
            param2: inst.param2,
            bit:inst.bit,
            toString: function() { return `${this.name} ${this.target} ${this.param1} ${this.param2} ${this.bit}`; }
        }));
        runner.successIndex = obj.successIndex;
        runner.hardcoded.forEach(n => runner.hardcode(n));
        runner.witness.forEach(n => runner.addWitness(n));
        return runner;
    }

    private executeOne() {
        if (this.current >= this.instructions.length) {
            this.current++;
            return;
        }
        const instr = this.instructions[this.current];
        let target = this.registers[instr.target];
        if (!target) {
            target = {
                value: 0n,
                hardcoded: false,
                witness: false,
                index: instr.target
            };
            this.registers[instr.target] = target;
        }
        const param1 = this.registers[instr.param1!];
        if (!param1) 
            throw new Error(`Invalid param1 line: ${this.current}, instr: ${instr}`);
        const param2 = this.registers[instr.param2!];
        switch (instr.name) {
            case InstrCode.ADDMOD:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (param1.value + param2.value) % prime_bigint;
                break;
            case InstrCode.ANDBIT:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value & (2n ** BigInt(instr.bit ?? 0)) ? param2.value : 0n;
                break;
            case InstrCode.ANDNOTBIT:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !(param1.value & (2n ** BigInt(instr.bit ?? 0))) ? param2.value : 0n;
                break;
            case InstrCode.MOV:
                target.value = param1.value;
                break;
            case InstrCode.EQUAL:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value === param2.value ? 1n : 0n;
                break;
            case InstrCode.MULMOD:
                if (!param2) 
                    throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (param1.value * param2.value) % prime_bigint;
                break;
            case InstrCode.OR:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !!param1.value || !!param2.value ? 1n : 0n;
                break;
            case InstrCode.AND:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !!param1.value && !!param2.value ? 1n : 0n;
                break;
            case InstrCode.NOT:
                target.value = !param1.value ? 1n : 0n;
                break;
            case InstrCode.SUBMOD:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (prime_bigint + param1.value - param2.value) % prime_bigint;
                break;
            case InstrCode.DIVMOD:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (param1.value * modInverse(param2.value, prime_bigint)) % prime_bigint;
                break;
            case InstrCode.ASSERTONE:
                if (param1.value != 1n) {
                    target.value = 0n;
                }
                break;
            case InstrCode.ASSERTZERO:
                if (param1.value != 0n) {
                    target.value = 0n;
                }
                break;
        }
        this.current++;
    }

    public execute(stop?: number) {
        stop = stop ?? this.instructions.length - 1;
        while (this.current <= stop) {
            this.executeOne();
        }
    }

    public getRegisterValues(): bigint[] {
        return this.registers.map(r => r.value);
    }

    public getStateRoot(): bigint {
        return calculateMerkleRoot(this.getRegisterValues());
    }

    public getInstruction(line: number): Instruction {
        if (line >= this.instructions.length) {
            return {
                name: InstrCode.ASSERTONE,
                param1: this.successIndex,
                target: this.successIndex
            };
        }
        return this.instructions[line];
    }

    public getSuccess(): boolean {
        return this.registers[this.successIndex].value != 0n;
    }
}
