export interface Register {
    value: bigint;
    hardcoded: boolean;
    witness: boolean;
    index: number;
    free?: boolean;
}

export function toPyBinary(r: Register): string {
    let s = '';
    let n = r.value;
    while (n > 0) {
        s = (n & 0x01n ? '1' : '0') + s;
        n = n >> 1n;
    }
    while (s.length < 32) s = '0' + s;
    return s;
}
