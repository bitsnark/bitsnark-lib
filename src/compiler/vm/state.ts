
export class Register {

    value = 0n;
    assert = false;
    index = 0;
    hardcoded = false;
    title?: string;

    constructor(index: number) {
        this.index = index;
    }

    getValue(): bigint {
        return this.value;
    }

    setValue(value: bigint) {
        if (this.assert && this.value !== value) throw new Error(`Assertion error, r=${this.index}`);
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
        for (let i = 0; ; i++) {
            if (!this.registers[i]) return i;
        }
    }

    newRegister(): Register {
        const r = new Register(this.findFreeIndex());
        this.setRegister(r);
        return r;
    }

    setRegister(r: Register) {
        this.registers[r.index] = r;
        if(r.index > this.highestIndex) this.highestIndex = r.index;
    }

    getRegister(index: number): Register {
        return this.registers[index];
    }

    getSubstate(indexes: number[]): State {
        const s = new State();
        s.registers = indexes.map(i => this.getRegister(i));
        return s;
    }

    hardcodedWithIndex(index: number, title: string, value: bigint): Register {
        const t = new Register(index);
        t.value = value;
        t.assert = true;
        t.hardcoded = true;
        t.title = title;
        this.setRegister(t);
        return t;
    }

    hardcoded(title: string, value: bigint): Register {
        const t = new Register(this.findFreeIndex());
        t.value = value;
        t.assert = true;
        t.title = title;
        t.hardcoded = true;
        this.setRegister(t);
        return t;
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
