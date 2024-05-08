let lastRegisterKey = 0;

export class Register {

    key: number = lastRegisterKey++;
    value: bigint = 0n;
    hardcoded?: boolean;

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

export class State {

    registerMap: any = {};
    maxRegCount = 0;

    newRegister(): Register {
        let r: Register = new Register();
        this.registerMap[r as any] = r;
        this.maxRegCount = Math.max(this.maxRegCount, Object.keys(this.registerMap).length);
        return r;
    }

    freeRegister(r: Register) {
        if (r.hardcoded) throw new Error('Cannot free hardcoded register');
        delete this.registerMap[r as any];
    }

    freeRegisters(ra: Register[]) {
        ra.forEach(r => this.freeRegister(r));
    }

    getAllRegisters(): Register[] {
        const ra = (Object.values(this.registerMap) as Register[]);
        return ra;
    }

    getJson(): any {
        return {
            values: this.getAllRegisters()
                .filter(r => !r.hardcoded)
                .map(r => r.value.toString(16)),
            hardcoded: this.getAllRegisters()
                .filter(r => r.hardcoded)
                .map(r => r.value.toString(16))
        };
    }
}
