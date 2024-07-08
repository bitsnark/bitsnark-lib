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
            bit: Number(inst.bit ?? '0'),
            toString: function () { return `${this.name} ${this.target} ${this.param1} ${this.param2} ${this.bit}`; }
        }));
        runner.hardcoded.forEach(n => runner.hardcode(n));
        runner.witness.forEach(n => runner.addWitness(n));
        runner.successIndex = obj.successIndex;
        return runner;
    }

    private executeOne() {
        const instr = this.instructions[this.current];
        if (!instr) {
            this.current++;
            return;
        }

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
            case InstrCode.ADD:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (param1.value + param2.value) & 0xffffffffn;
                break;
            case InstrCode.ADDOF:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = (param1.value + param2.value) >> 32n;
                break;
            case InstrCode.SUB:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value >= param2.value ? param1.value - param2.value : param1.value + 0x0100000000n - param2.value;
                break;
            case InstrCode.SUBOF:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value >= param2.value ? 0n : 1n;
                break;
            case InstrCode.MOV:
                target.value = param1.value;
                break;
            case InstrCode.ANDBIT:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !!(param1.value & (2n ** BigInt(instr.bit!))) ? param2.value : 0n;
                break;
            case InstrCode.ANDNOTBIT:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !(param1.value & (2n ** BigInt(instr.bit!))) ? param2.value : 0n;
                break;
            case InstrCode.EQUAL:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value === param2.value ? 1n : 0n;
                break;
            case InstrCode.OR:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !!param1.value || !!param2.value ? 1n : 0n;
                break;
            case InstrCode.AND:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = !!param1.value && !!param2.value ? 1n : 0n;
                break;
            case InstrCode.XOR:
                if (!param2) throw new Error(`Invalid param2 line: ${this.current}`);
                target.value = param1.value ^ param2.value ? 1n : 0n;
                break;
            case InstrCode.NOT:
                target.value = !param1.value ? 1n : 0n;
                break;
            case InstrCode.ASSERTONE:
                target.value = param1.value == 1n ? 1n : 0n;
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

    public getRegisters() {
        return this.registers;
    }

    public getRegisterValuesNoHardcoded(): bigint[] {
        return this.registers.filter(r => !r.hardcoded).map(r => r.value);
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
