

export const R_0 = 0;
export const R_1 = 1;

export class Registers {

    values: bigint[] = [ 0n, 1n ];
    nextIndex: number = 2;
    stack: number[] = [];
    total: number = 2;

    constructor() {
    }

    allocate(): number {
        const r = this.nextIndex;
        this.nextIndex++;
        this.total = this.total > this.nextIndex ? this.total : this.nextIndex;
        return r;
    }

    get(index: number): bigint {
        return this.values[index] ?? 0n;
    }

    set(index: number, value: bigint) {
        if(index < 2 && this.values[index] != value) throw new Error(`Assertion failed for r_${index}`);
        this.values[index] = value;
    }

    enterf() {
        this.stack.push(this.nextIndex);
    }

    exitf() {
        if(this.stack.length === 0) throw new Error('stack underflow');
        this.nextIndex = this.stack.pop() ?? 0;
    }

    print() {
        console.log('*** REGISTERS ***');
        console.log(`Count: ${this.total}`);
    }
}
