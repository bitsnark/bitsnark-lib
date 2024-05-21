import { prime_bigint } from "../bitcoin/ec/ec-hash";
import { modInverse } from "../generator/common/math-utils";
import { SavedVm } from "../generator/common/saved-vm";
import { State } from "../generator/common/state";
import { Instruction, InstrCode } from "../generator/step1/vm/types";

export class Runner {

    state: State = new State()
    witness: bigint[] = []
    hardcoded: bigint[] = []
    instructions: Instruction[] = [];
    current: number = 0;

    private constructor() {
    }

    public static load(obj: SavedVm<InstrCode>, witness: bigint[]): Runner {
        const runner = new Runner();
        runner.witness = witness;
        runner.hardcoded = obj.hardcoded.map((ns: string) => BigInt('0x' + ns));
        runner.instructions = obj.program.map(inst => ({
            name: inst.name,
            target: inst.target,
            params: inst.params,
            data: BigInt('0x' + inst.data ?? '')
        }));
        runner.witness.forEach(n => runner.state.newRegister(n));
        runner.hardcoded.forEach(n => runner.state.newHardcoded(n));
        return runner;
    }

    private executeOne() {
        const instr = this.instructions[this.current];
        const target = this.state.registers[instr.target];
        const param1 = this.state.registers[instr.params[0]];
        const param2 = this.state.registers[instr.params[1]];
        switch (instr.name) {
            case InstrCode.ADDMOD:
                target.value = (param1.value + param2.value) % prime_bigint;
                break;
            case InstrCode.ANDBIT:
                target.value = !!(param1.value & (2n ** BigInt(instr.data ?? 0))) ? param2.value : 0n;
                break;
            case InstrCode.MOV:
                target.value = param1.value;
                break;
            case InstrCode.EQUAL:
                target.value = param1.value === param2.value ? 1n : 0n;
                break;
            case InstrCode.MULMOD:
                target.value = (param1.value * param2.value) % prime_bigint;
                break;
            case InstrCode.OR:
                target.value = !!param1.value || !!param2.value ? 1n : 0n;
                break;
            case InstrCode.AND:
                target.value = !!param1.value && !!param2.value ? 1n : 0n;
                break;
            case InstrCode.NOT:
                target.value = !param1.value ? 1n : 0n;
                break;
            case InstrCode.SUBMOD:
                target.value = (prime_bigint + param1.value - param2.value) % prime_bigint;
                break;
            case InstrCode.DIVMOD:
                target.value = (param1.value * modInverse(param2.value, prime_bigint)) % prime_bigint;
                break;
        }
    }

    public execute(stop?: number) {
        stop = stop ?? 2 ** 64;
        while (this.current < stop) {
            this.executeOne();
        }
    }

    public getRegisters() {
        return this.state.registers;
    }
}
