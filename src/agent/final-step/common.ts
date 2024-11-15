import { StackItem } from '../../generator/step3/stack';

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export function teaPot() {
    throw new Error("I'm a teapot");
}

export function nibblesToBigintLS(s: StackItem[]): bigint {
    let result = 0n;
    for (let i = 0; i < s.length; i++) {
        result += BigInt(s[i].value as number) << (3n * BigInt(i));
    }
    return result;
}

export function bigintToNibblesLS(n: bigint, c?: number): number[] {
    const result: number[] = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result.push(Number(n & 0x7n));
        n = n >> 3n;
    }
    if (n > 0) teaPot();
    return result;
}
