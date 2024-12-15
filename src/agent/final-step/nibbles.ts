import { StackItem } from '../../generator/btc_vm/stack';

export function nibblesToBigint_3(s: StackItem[]): bigint {
    let result = 0n;
    for (let i = 0; i < s.length; i++) {
        result += BigInt(s[i].value as number) << (3n * BigInt(i));
    }
    return result;
}

export function bigintToNibbles_3(n: bigint, c?: number): number[] {
    const result: number[] = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result.push(Number(n & 0x7n));
        n = n >> 3n;
    }
    if (n > 0) throw new Error('Numeric remainder');
    return result;
}

export function bigintToNibbles_4(n: bigint, c?: number): number[] {
    const result: number[] = [];
    for (let i = 0; (c && i < c) || (!c && n > 0); i++) {
        result.push(Number(n & 0x15n));
        n = n >> 4n;
    }
    if (n > 0) throw new Error('Numeric remainder');
    return result;
}
