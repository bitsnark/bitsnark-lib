import { hash, hashPair } from "../encoding";

export function merkelize(na: bigint[]): bigint {
    let n = 0;
    while (na.length > 1) {
        const newNa: bigint[] = [];
        while (na.length > 0) {
            if (na.length == 1) {
                newNa.push(na.shift()!);
            } else {
                const l = na.shift()!;
                const r = na.shift()!;
                const h = hashPair(l, r)
                newNa.push(h);
            }
        }
        na = newNa;
    }
    return na[0];
}
