
export class Register {

    value = 0n;
    assert = false;
    index = 0;
    hardcoded = false;
    title?: string;

    constructor() {
        this.index = state.findFreeIndex();
        state.setRegister(this);
    }

    static hardcodedWithIndex(index: number, title: string, value: bigint): Register {
        const t = new Register();
        t.index = index;
        t.value = value;
        t.assert = true;
        t.hardcoded = true;
        t.title = title;
        state.setRegister(t);
        return t;
    }

    static hardcoded(title: string, value: bigint): Register {
        const t = new Register();
        t.index = state.findFreeIndex();
        t.value = value;
        t.assert = true;
        t.title = title;
        t.hardcoded = true;
        return t;
    }

    getValue(): bigint {
        return this.value;
    }

    setValue(value: bigint) {
        if(this.assert && this.value !== value) throw new Error(`Assertion error, r=${this.index}`);
        this.value = value;
    }

    forceValue(value: bigint) {
        this.value = value;
    }
}

export class State {

    registers: Register[] = [];
    highestIndex = 0;

    findFreeIndex(): number {
        for(let i = 0; ; i++) {
            if(!this.registers[i]) return i;
        }
    }

    setRegister(r: Register) {
        this.registers[r.index] = r;
    }

    getRegister(index: number): Register {
        return this.registers[index];
    }

    getSubstate(indexes: number[]): State {
        const s = new State();
        s.registers = indexes.map(i => this.getRegister(i));
        return s;
    }

    getHighsetIndex() {
        return this.highestIndex;
    }

    getJson(): any {
        return {
            count: this.highestIndex,
            hardcoded: this.registers.filter(r => r.hardcoded && r.index >= 0).
                map(r => ({ index: r.index, value: r.value.toString(16), title: r.title }))
        };
    }
}

export const state = new State();

export const R_R = Register.hardcodedWithIndex(-1, '', 0n);
export const R_0 = Register.hardcodedWithIndex(0, 'R_0', 0n);
export const R_1 = Register.hardcodedWithIndex(1, 'R_1', 1n);
