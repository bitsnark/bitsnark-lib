import { proof as proofConst, vKey } from '../../generator/ec_vm/constants';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { SavedVm } from '../../generator/common/saved-vm';
import { InstrCode } from '../../generator/ec_vm/vm/types';
import { Runner } from '../../generator/ec_vm/vm/runner';

export interface RegsItem {
    runtimeIndex: number;
    value?: bigint;
}

export function getRegsAt(savedVm: SavedVm<InstrCode>, left: number, line: number, right: number): RegsItem[] {
    right = Math.min(right, savedVm.program.length);
    const runner = Runner.load(savedVm);
    const writtenFlags: boolean[] = [];
    for (let i = left; i <= line; i++) {
        const instr = runner.instructions[i];
        writtenFlags[instr.target] = true;
    }
    const readFlags: boolean[] = [];
    for (let i = line; i < right; i++) {
        const instr = runner.instructions[i];
        readFlags[instr.param1] = true;
        if (instr.param2) readFlags[instr.param2] = true;
    }
    const map: RegsItem[] = [];
    runner.execute(line);
    const regs = runner.getRegisterValues();
    for (let i = 0; i < regs.length; i++) {
        if (writtenFlags[i] && readFlags[i]) map.push({ runtimeIndex: i, value: regs[i] });
    }
    return map.sort((mi1, mi2) => mi1.runtimeIndex - mi2.runtimeIndex);
}

export class StateCommitment {
    public readonly left: number;
    public readonly right: number;
    public readonly iteration: number;
    public readonly selection: number;
    public readonly line: number;
    public readonly savedVm: SavedVm<InstrCode>;

    private values?: bigint[];
    private regIndexToRuntimeIndex?: number[];

    constructor(obj: Partial<StateCommitment>) {
        this.left = obj.left!;
        this.right = obj.right!;
        this.iteration = obj.iteration!;
        this.selection = obj.selection!;
        this.savedVm = obj.savedVm!;
        this.line = obj.line!;
    }

    public getValues(): bigint[] {
        if (this.values) return this.values;
        const regs = getRegsAt(this.savedVm, this.left, this.line, this.right);
        this.values = regs.map((ri) => ri.value!);
        // pad to 64 so our merkle proofs are the same size
        while (this.values.length < 64) this.values.push(0n);
        this.regIndexToRuntimeIndex = regs.map((ri) => ri.runtimeIndex ?? 0);
        return this.values;
    }

    public getIndexForRuntimeIndex(runtimeIndex: number): number {
        if (!this.regIndexToRuntimeIndex) this.getValues();
        const index = this.regIndexToRuntimeIndex!.findIndex((ri) => runtimeIndex === runtimeIndex);
        if (index < 0) throw new Error('Runtime index not found in state commitment');
        return index;
    }

    public getValueForRuntimeIndex(runtimeIndex: number): bigint {
        if (!this.regIndexToRuntimeIndex) this.getValues();
        const index = this.getIndexForRuntimeIndex(runtimeIndex);
        return this.values![index];
    }
}

export class Decasector {
    total: number;
    iterations: number;
    stateCommitmentByLine: StateCommitment[] = [];
    proof: Step1_Proof;
    savedVm: SavedVm<InstrCode>;

    constructor(proof?: bigint[]) {
        step1_vm.reset();
        this.proof = proof ? Step1_Proof.fromWitness(proof) : Step1_Proof.fromSnarkjs(proofConst);
        groth16Verify(Key.fromSnarkjs(vKey), this.proof);
        if (!step1_vm.success?.value) throw new Error('Failed.');
        const program = step1_vm.instructions;
        this.savedVm = step1_vm.save();
        this.iterations = Math.ceil(Math.log10(program.length));
        this.total = 10 ** this.iterations;
        this.stateCommitments();
    }

    private stateCommitments() {
        const _sc = (left: number, right: number, iter: number) => {
            if (iter > this.iterations) return;
            const d = (right - left) / 10;
            for (let i = 0; i <= 9; i++) {
                const line = left + (i + 1) * d;
                if (!this.stateCommitmentByLine[line]) {
                    this.stateCommitmentByLine[line] = new StateCommitment({
                        left,
                        right,
                        iteration: iter,
                        selection: i,
                        line,
                        savedVm: this.savedVm
                    });
                }
                _sc(left + i * d, left + (i + 1) * d, iter + 1);
            }
        };
        _sc(0, this.total, 1);
    }

    public getLinesForSelectionPath(selectionPath: number[]): number[] {
        const rows: number[] = [];
        const { left, right } = this.getRangeForSelectionPath(selectionPath);
        const d = (right - left) / 10;
        for (let i = 1; i <= 9; i++) {
            rows[i] = left + i * d;
        }
        return rows;
    }

    public getRangeForSelectionPath(selectionPath: number[]): { left: number; right: number } {
        let left = 0;
        let right = this.total;
        for (const selection of selectionPath) {
            const d = (right - left) / 10;
            const tl = left + selection * d;
            const tr = left + (selection + 1) * d;
            left = tl;
            right = tr;
        }
        return { left, right };
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    try {
        const d = new Decasector();
        console.log(d.stateCommitmentByLine);
    } catch (e) {
        console.error(e);
    }
}
