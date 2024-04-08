
const map: Map<number, boolean> = new Map<number, boolean>();

export let highestIndex = 0;
const MAX_HARDCODED = 4;

export class Register {

    private value = 0n;
    private assert = false;
    private auto = false;
    private disposed = false;
    private r_index = 0 ;

    constructor() {
        this.auto = true;
        this.r_index = Register.findFreeIndex();
        map.set(this.r_index, true);
        if (this.r_index > highestIndex) highestIndex = this.r_index;
    }

    [Symbol.dispose]() {
        if (!this.auto) return;
        this.disposed = true;
        map.set(this.r_index, false);
    }

    static findFreeIndex(): number {
        for(let i = MAX_HARDCODED; ; i++) {
            if(!map.get(i)) return i;
        }
    }

    static hardcodedWithIndex(r_index: number, value: bigint): Register {
        const t = new Register();
        t.r_index = r_index;
        map.set(r_index, true);
        t.value = value;
        t.assert = true;
        return t;
    }

    static hardcoded(value: bigint): Register {
        const t = new Register();
        t.r_index = Register.findFreeIndex();
        map.set(t.r_index, true);
        if (t.r_index > highestIndex) highestIndex = t.r_index;
        t.value = value;
        t.assert = true;
        return t;
    }

    getValue(): bigint {
        if (this.disposed) throw new Error(`This register is already disposed: ${this.r_index}`);
        return this.value;
    }

    getIndex(): number {
        return this.r_index;
    }

    setValue(value: bigint) {
        if (this.disposed) throw new Error(`This register is already disposed: ${this.r_index}`);
        if(this.assert && this.value !== value) throw new Error(`Assertion error, r=${this.r_index}`);
        this.value = value;
    }

    forceValue(value: bigint) {
        if (this.disposed) throw new Error(`This register is already disposed: ${this.r_index}`);
        this.value = value;
    }

    testBit(position: number): boolean {
        // Shift 1 to the left by 'position' to create a mask
        const mask: bigint = 1n << BigInt(position);
        // Use bitwise AND to check if the bit at 'position' is set
        return (this.value & mask) !== 0n;
    }
}

export const R_R = Register.hardcodedWithIndex(-1, 0n);
export const R_0 = Register.hardcodedWithIndex(0, 0n);
export const R_1 = Register.hardcodedWithIndex(1, 1n);
export const R_MAX = Register.hardcodedWithIndex(2, 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn);
