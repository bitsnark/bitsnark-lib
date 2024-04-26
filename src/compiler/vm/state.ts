
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

    forceValue(value: bigint) {
        this.value = value;
    }

    isBit(b: number): boolean {
        return !!(this.value && 2 ** b);
    }
}

export class State {

    hardcodedMap = new Map<bigint, Register>();
    registers: Register[] = [];
    highestIndex = 0;
    failed: boolean = false;

    newRegister(): Register {
        const r = new Register(this.highestIndex++);
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

    hardcodedWithIndex(index: number, value: bigint): Register {
        const t = new Register(index);
        t.value = value;
        t.assert = true;
        t.hardcoded = true;
        this.setRegister(t);
        return t;
    }

    hardcoded(value: bigint): Register {
        let t = this.hardcodedMap.get(value);
        if (t) return t;
        t = new Register(this.highestIndex++);
        t.value = value;
        t.assert = true;
        t.hardcoded = true;
        this.setRegister(t);
        this.hardcodedMap.set(value, t);
        return t;
    }

    getHighsetIndex() {
        return this.highestIndex;
    }

    getJson(): any {
        return {
            failed: this.failed,
            count: this.highestIndex,
            hardcoded: this.registers.filter(r => r.hardcoded && r.index >= 0).
                map(r => ({ index: r.index, value: r.value.toString(16), title: r.title }))
        };
    }

    setFailed() {
        this.failed = true;
    }
}
