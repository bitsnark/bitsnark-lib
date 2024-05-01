let lastRegisterKey = 0;

export class Register {

    key: number = lastRegisterKey++;
    value: bigint = 0n;
    hardcoded?: boolean;
    first?: number;
    last?: number;
    interval?: number;

    toString() { return `${this.key}`; }
}

export abstract class GcExceptable {
    abstract getRegisters(): Register[];
}

export class State {

    hardcodedMap = new Map<bigint, Register>();
    registerMap: any = {};
    freeRegisters: Register[] = [];
    failed: boolean = false;
    lastIndex: number = 0;
    gcStack: Register[][] = [];

    newRegister(): Register {
        let r: Register = new Register();
        if (this.freeRegisters.length > 0) {
            r = this.freeRegisters.pop()!;
            r.hardcoded = false;
            r.value = 0n;
        }
        this.registerMap[r as any] = r;
        if (this.gcStack.length > 0) {
            this.gcStack[this.gcStack.length - 1].push(r);
        }
        return r;
    }

    freeRegister(r: Register) {
        if (r.hardcoded) throw new Error('Cannot free hardcoded register');
        delete this.registerMap[r as any];
        this.freeRegisters.push(r);
        // console.log('free register regs: ', Object.values(this.registerMap).length, '   free: ' , this.freeRegisters.length);
    }

    hardcoded(value: bigint): Register {
        let t = this.hardcodedMap.get(value);
        if (t) return t;
        t = this.newRegister();
        t.value = value;
        t.hardcoded = true;
        this.hardcodedMap.set(value, t);
        return t;
    }

    getAllRegisters(): Register[] {
        const ra = (Object.values(this.registerMap) as Register[]);
        return [ ...ra, ...this.freeRegisters ];
    }

    getJson(): any {
        return {
            failed: this.failed,
            values: this.getAllRegisters()
                .filter(r => !r.hardcoded)
                .map(r => r.value.toString(16)),
            hardcoded: this.getAllRegisters()
                .filter(r => r.hardcoded)
                .map(r => r.value.toString(16))
        };
    }

    setFailed() {
        this.failed = true;
    }

    // enterGcStack() {
    //     this.gcStack.push([]);
    //     // console.log('Enter GC Stack, reg count: ', Object.keys(this.registerMap).length);
    // }

    // exitGcStack(except: (Register | GcExceptable)[]) {
    //     if (this.gcStack.length == 0) throw new Error('Stack underflow?');
    //     const ra = this.gcStack.pop()!;
    //     const exceptRegs = except.map(ex => {
    //         if (ex instanceof Register) return ex;
    //         if (ex.getRegisters) return ex.getRegisters();
    //         return [];
    //     }).flat();
    //     // console.log('Exit gc stack, exceptReg: ', except.length, exceptRegs.length);
    //     ra.forEach(r => {
    //         if (!r.hardcoded && !exceptRegs.some(tr => tr === r)) this.freeRegister(r);
    //     });
    // }
}
