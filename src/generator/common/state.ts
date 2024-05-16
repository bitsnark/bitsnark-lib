import { Register } from "./register";

export class State {

    registers: Register[] = [];
    maxRegCount = 0;

    newRegister(n?: bigint): Register {
        let r: Register = new Register();
        r.index = this.registers.length;
        this.registers[r.index] = r;
        this.maxRegCount = Math.max(this.maxRegCount, this.registers.length);
        r.value = n ?? 0n;
        return r;
    }

    newHardcoded(n: bigint) {
        let r: Register = new Register();
        r.index = this.registers.length;
        this.registers[r.index] = r;
        this.maxRegCount = Math.max(this.maxRegCount, this.registers.length);
        r.value = n ?? 0n;
        r.hardcoded = true;
        return r;
    }
}
