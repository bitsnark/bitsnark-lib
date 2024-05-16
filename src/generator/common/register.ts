
export let lastRegisterKey = 0;

export class Register {

    key: number = lastRegisterKey++;
    value: bigint = 0n;
    hardcoded?: boolean;
    index: number = -1;
    last?: number;
    first?: number;
    interval?: number;

    toString() { return `${this.key}`; }

    toPyBinary(): string {
        let s = '';
        let n = this.value;
        while (n > 0) {
            s = (n & 0x01n ? '1' : '0') + s;
            n = n >> 1n;
        }
        while (s.length < 32) s = '0' + s;
        return s;
    }
}

