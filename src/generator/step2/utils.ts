import { Register } from "./vm/state";
import { vm } from "./vm/vm";

export function makeRegisters(n: number) {
    const ra: Register[] = [];
    while (ra.length < n) ra.push(vm.newRegister());
    return ra;
}

export function toNum(ra: Register[]): bigint {
    let n = 0n;
    for (let i = 0; i < ra.length; i++) {
        n = n << 32n;
        n = n + BigInt(ra[i].value);
    }
    return n;
}
