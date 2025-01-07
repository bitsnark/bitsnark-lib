import { SavedVm } from '../../generator/common/saved-vm';
import { InstrCode } from '../../generator/ec_vm/vm/types';
import { Runner } from '../../generator/ec_vm/vm/runner';
import { loadProgram } from '../setup/groth16-verify';

export function getRegsAt(savedVm: SavedVm<InstrCode>, left: number, line: number): bigint[] {
    const runner = Runner.load(savedVm);
    runner.execute(line);
    const regs = runner.getRegisterValues();
    return regs;
}

export class StateCommitment {
    public readonly left: number;
    public readonly right: number;
    public readonly iteration: number;
    public readonly selection: number;
    public readonly line: number;
    public readonly savedVm: SavedVm<InstrCode>;
    public readonly selectionPath: number[];

    private values?: bigint[];

    constructor(obj: Partial<StateCommitment>) {
        this.left = obj.left!;
        this.right = obj.right!;
        this.iteration = obj.iteration!;
        this.selection = obj.selection!;
        this.savedVm = obj.savedVm!;
        this.line = obj.line!;
        this.selectionPath = obj.selectionPath!;
    }

    public getValues(): bigint[] {
        if (this.values) return this.values;
        this.values = getRegsAt(this.savedVm, this.left, this.line);
        return this.values;
    }
}

export class Decasector {
    total: number;
    iterations: number;
    stateCommitmentByLine: StateCommitment[] = [];
    savedVm: SavedVm<InstrCode>;

    constructor(proof?: bigint[]) {
        this.savedVm = loadProgram(proof);
        this.total = this.savedVm.program.length;
        this.iterations = Math.ceil(Math.log10(this.total));
        this.stateCommitments();
    }

    private stateCommitments() {
        const _sc = (left: number, right: number, iter: number, selectionPath: number[]) => {
            if (iter > this.iterations) return;
            const d = (right - left) / 10;
            for (let i = 0; i < 9; i++) {
                const line = Math.round(left + (i + 1) * d);
                if (this.stateCommitmentByLine[line]) continue;
                this.stateCommitmentByLine[line] = new StateCommitment({
                    left,
                    right,
                    iteration: iter,
                    selection: i,
                    line,
                    savedVm: this.savedVm
                });
                _sc(Math.round(left + i * d), Math.round(left + (i + 1) * d), iter + 1, [...selectionPath, i]);
            }
            _sc(Math.round(left + 9 * d), Math.round(left + (9 + 1) * d), iter + 1, [...selectionPath, 9]);
        };
        this.stateCommitmentByLine[0] = new StateCommitment({
            left: 0,
            right: this.total,
            iteration: 0,
            selection: 0,
            line: 0,
            savedVm: this.savedVm
        });
        this.stateCommitmentByLine[this.total] = new StateCommitment({
            left: 0,
            right: this.total,
            iteration: 0,
            selection: 0,
            line: this.total,
            savedVm: this.savedVm
        });
        _sc(0, this.total, 1, []);
    }

    public getLinesForSelectionPath(selectionPath: number[]): number[] {
        const rows: number[] = [];
        const { left, right } = this.getRangeForSelectionPath(selectionPath);
        const d = (right - left) / 10;
        for (let i = 1; i <= 9; i++) {
            rows.push(Math.round(left + i * d));
        }
        return rows;
    }

    public getRangeForSelectionPath(selectionPath: number[]): { left: number; right: number } {
        let left = 0;
        let right = this.total;
        for (const selection of selectionPath) {
            const d = (right - left) / 10;
            const tl = Math.round(left + selection * d);
            const tr = Math.round(left + (selection + 1) * d);
            left = tl;
            right = tr;
        }
        return { left, right };
    }

    public getRegsForSuccess() {
        const runner = Runner.load(this.savedVm);
        runner.execute(this.savedVm.programLength);
        return runner.getRegsForSuccess();
    }

    public getLineBySelectionPath(selectionPath: number[]): number {
        let left = 0;
        let right = this.total;
        for (const selection of selectionPath) {
            const d = (right - left) / 10;
            const tl = Math.round(left + selection * d);
            const tr = Math.round(left + (selection + 1) * d);
            left = tl;
            right = tr;
        }
        return right;
    }
}

if (require.main === module) {
    try {
        const d = new Decasector();
        console.log(d.stateCommitmentByLine);
    } catch (e) {
        console.error(e);
    }
}
