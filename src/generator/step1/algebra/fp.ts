import { vm } from "../vm/vm";
import { prime_bigint } from "../vm/prime";
import { Register } from "../../common/register";

export class Fp {

    register: Register;

    constructor(r?: Register) {
        if (r && r.value! < 0) {
            r.value = (prime_bigint + r.value) % prime_bigint;
        }
        this.register = r ?? vm.newRegister();
    }

    getRegisters(): Register[] {
        return [this.register];
    }

    static hardcoded(n: bigint): Fp {
        return new Fp();
    }

    zero(): Fp {
        return Fp.hardcoded(0n);
    }

    one(): Fp {
        return Fp.hardcoded(1n);
    }

    static zero(): Fp {
        return Fp.hardcoded(0n);
    }

    static one(): Fp {
        return Fp.hardcoded(1n);
    }

    if(r: Register, other: Fp): Fp {
        const result = new Fp();
        vm.ifThenElse(result.getRegister(), r, this.getRegister(), other.getRegister());
        return result;
    }

    ifBit(r: Register, bit: number, other: Fp): Fp {
        const nr = vm.newRegister();
        vm.andBit(nr, r, bit, this.register);
        vm.andNotBit(nr, r, bit, other.register);
        return new Fp(nr);
    }

    eq(a: Fp): Register {
        const f = vm.newRegister();
        vm.equal(f, this.register, a.register);
        return f;
    }

    add(a: Fp): Fp {
        const t = vm.newRegister();
        vm.addMod(t, this.register, a.register);
        return new Fp(t);
    }

    mul(a: Fp): Fp {
        const t = vm.newRegister();
        vm.mulMod(t, this.register, a.register);
        return new Fp(t);
    }

    sub(a: Fp): Fp {
        const t = vm.newRegister();
        vm.subMod(t, this.register, a.register);
        return new Fp(t);
    }

    div(a: Fp): Fp {
        const t = vm.newRegister();
        vm.divMod(t, this.register, a.register);
        return new Fp(t);
    }

    getRegister(): Register {
        return this.register;
    }

    neg(): Fp {
        return this.zero().sub(this);
    }

    inv(): Fp {
        return this.one().div(this);
    }

    toString(): string {
        return `${this.getRegister().value}`;
    }
}
