import { Register } from "./vm/state";
import { vm } from "./vm/vm";

export function prepareWitness(n: bigint): Register[] {
    const words = [];
    for (let i = 7; i >= 0; i--) {
        let tn = 0n;
        for (let j = 0; j < 32; j++) {
            const bit = n & 0x01n;
            n = n >> 1n;
            tn += bit * 2n ** BigInt(j);
        }
        words[i] = vm.addWitness(tn);
    }
    return words;
}

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
