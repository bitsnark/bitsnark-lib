
function fromBin(s: string): bigint {
    let n: bigint = 0n;
    for (let i = s.length - 1; i >= 0; i--) {
        if (s.charAt(i) == '1') n += 2n ** BigInt(i);
    }
    return n;
}

function reverse(s: string): string {
    let t = '';
    for (let i = 0; i < s.length; i++) t = s.charAt(i) + t;
    return t;
}

function toBin(n: bigint, c?: number, be?: boolean): string {
    let s = '';
    while (n > 0n) {
        s = s + (n & 1n ? '1' : '0');
        n = n >> 1n;
    }
    if (c) while (s.length < c) s = s + '0';
    if (be) s = reverse(s);
    return s;
}

function lengthBits(n: number): string {
    let s = '';
    while (n > 0) {
        s = (n & 1 ? '1' : '0') + s;
        n = n >> 1;
    }
    while (s.length < 64) s = '0' + s; 
    return s;
}

export function prepareMsg(msg: string): bigint {

    const ca: number[] = [];
    const sw = (i: number, j: number) => {
        const t = ca[i]; ca[i] = ca[j]; ca[j] = t;
    }
    for (let i = 0; i < msg.length; i++) {
        ca.push(msg.charCodeAt(i));
    }
    while(ca.length % 4 > 0) ca.push(0);
    for (let i = 0; i < ca.length / 4; i++) {
        sw(i * 4, i * 4 + 3);
        sw(i * 4 + 1, i * 4 + 2);
    }
    let s = '';
    for (let i = 0; i < ca.length; i++) {
        for (let j = 0; j < 8; j++) {
            s = (ca[i] & (2 ** j) ? '1' : '0') + s;
        }
    }
    const len = s.length;
    s = s + '1';
    while (s.length < 960) s = s + '0';
    s = s + lengthBits(len);
    return fromBin(s);
}
