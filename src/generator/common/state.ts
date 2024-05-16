import { Register } from "./register";

export class State {

    registers: Register[] = [];
    maxRegCount = 0;

    newRegister(): Register {
        let r: Register = new Register();
        r.index = this.registers.length;
        this.registers[r.index] = r;
        this.maxRegCount = Math.max(this.maxRegCount, this.registers.length);
        return r;
    }
}
