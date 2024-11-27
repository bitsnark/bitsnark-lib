import { StackItem } from '../../generator/btc_vm/stack';

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
    if (n > 0) throw new Error('Numeric remainder');
    return result;
}
