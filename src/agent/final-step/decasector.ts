
export class Decasector {

    total: number;
    iterations: number;
    sc: number[][] = [];

    constructor(total: number) {
        this.iterations = Math.ceil(Math.log10(total));
        this.total = 10 ** this.iterations;
        this.stateCommitments();
    }

    private stateCommitments() {
        this.sc[0] = [0, 0];
        this.sc[this.total] = [0, 1];
        const _sc = (left: number, right: number, iter: number) => {
            if (iter > this.iterations) return;
            const d = (right - left) / 10;
            for (let i = 0; i <= 9; i++) {
                this.sc[left + (i + 1) * d] = this.sc[left + (i + 1) * d] ?? [iter, i];
                _sc(left + i * d, left + (i + 1) * d, iter + 1);
            }
        };
        _sc(0, this.total, 1);
    }

    public getStateCommitmentsForRow(row: number) {
        return [ this.sc[row], this.sc[row + 1] ];
    }

    public getRowsForSelectionPath(selectionPath: number[]): number[] {
        const rows: number[] = [];
        let left = 0;
        let right = this.total;
        const _sc = () => {
            const d = (right - left) / 10;
            for (let i = 1; i <= 9; i++) {
                rows[i] = left + i * d;
            }    
        }
        _sc();
        for (const selection of selectionPath) {
            left = rows[selection];
            right = rows[selection + 1];
            _sc();
        }
        return rows;
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    try {
        const d = new Decasector(1000000);
        console.log();
    } catch (e) { 
        console.error(e);
    }
}
