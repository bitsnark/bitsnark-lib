import { Register } from "./register";

export class State {

    registers: Register[] = [];
    freeRegs: Register[] = [];
    maxRegCount = 0;
    gcStack: number[] = [];

    newRegister(n?: bigint): Register {
        let r;
        if (this.freeRegs.length > 0) {
            r = this.freeRegs.pop()!;
            r.free = false;
        } else {
            r = { value: 0n, index: this.registers.length, hardcoded: false, witness: false };
            r.index = this.registers.length;
            this.registers[r.index] = r;
        }
        this.maxRegCount = Math.max(this.maxRegCount, this.registers.length);
        r.value = n ?? 0n;
        return r;
    }

    freeRegister(r: Register) {
        r.free = true;
        this.freeRegs.push(r);
    }

    gcEnter() {
        this.gcStack.push(this.registers.length);
    }

    gcExit(toKeep: Register[]) {
        if (this.gcStack.length <= 0) throw new Error('Stack underflow');
        const t = this.gcStack.pop()!;
        for (let i = t; i < this.registers.length; i++) {
            if (toKeep.every(r => r != this.registers[i]))
                this.freeRegister(this.registers[i]);
        }
    }

    reset() {
        this.freeRegs = [];
        this.gcStack = [];
        this.freeRegs = [];
        this.registers = this.registers.filter(r => r.hardcoded);
        this.maxRegCount = this.registers.length;
    }
}
