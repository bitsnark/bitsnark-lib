import { prime_bigint } from "../groth16/algebra/fp";
import { modInverse } from "../groth16/common/math-utils";
import { State, Register } from "../groth16/vm/state";
import { Instruction, InstrCode } from "../groth16/vm/vm";

export class Runner {

    state: State;
    witness: bigint[] = []
    hardcoded: bigint[] = []
    instructions: Instruction[] = [];
    current: number = 0;

    constructor() {
        this.state = new State();
    }

    reset() {
        this.state = new State();
        this.witness = [];
        this.hardcoded = [];
        this.instructions = [];
        this.current = 0;
    }

    newRegister(): Register {
        return this.state.newRegister();
    }

    addWitness(value: bigint) {
        this.witness.push(value);
    }

    hardcode(value: bigint): Register {
        if (value >= 2n ** 256n) throw new Error('Too big');
        return this.state.hardcoded(value);
    }

    executeOne() {
        const instr = this.instructions[this.current];
        let v = 0n;
        let f = false;
        switch (instr.name) {
            case InstrCode.ADDMOD:
                instr.target.value = (instr.params[0].value + instr.params[1].value) % prime_bigint;
                break;
            case InstrCode.ANDBIT:
                f = !!(instr.params[0].value & (2n ** BigInt(instr.bit ?? 0)));
                instr.target.value = f ? instr.params[1].value : 0n;
                break;
            case InstrCode.MOV:
                instr.target.value = instr.params[0].value;
                break;
            case InstrCode.EQUAL:
                instr.target.value = instr.params[0].value === instr.params[1].value ? 1n : 0n;
                break;
            case InstrCode.MULMOD:
                instr.target.value = (instr.params[0].value * instr.params[1].value) % prime_bigint;
                break;
            case InstrCode.OR:
                instr.target.value = !!instr.params[0].value || !!instr.params[1].value ? 1n : 0n;
                break;
            case InstrCode.AND:
                instr.target.value = !!instr.params[0].value && !!instr.params[1].value ? 1n : 0n;
                break;
            case InstrCode.NOT:
                instr.target.value = !instr.params[0].value ? 1n : 0n;
                break;
            case InstrCode.SUBMOD:
                instr.target.value = (prime_bigint + instr.params[0].value - instr.params[1].value) % prime_bigint;
                break;
            case InstrCode.DIVMOD:
                v = modInverse(instr.params[1].value, prime_bigint);
                instr.target.value = (instr.params[0].value * v) % prime_bigint;
                break;
        }
    }
}
