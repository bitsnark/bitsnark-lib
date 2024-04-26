import { vm } from "../vm/vm";
import { Register } from "../vm/state";
import { modInverse } from "../common/math-utils";

export const prime_bigint = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;

export class Fp {

    static optimizeHardcoded = false;

    register: Register;
    prime: Register;

    constructor(r?: Register) {
        this.prime = vm.hardcoded(prime_bigint);
        if (r && r.value < 0) {
            r.forceValue((this.prime.getValue() + r.getValue()) % this.prime.getValue());
        }
        this.register = r ?? vm.newRegister();
    }

    static setOptimizeHardcoded(f: boolean) {
        Fp.optimizeHardcoded = f;
    }
    
    static hardcoded(n: bigint): Fp {
        return new Fp(vm.hardcoded(n));
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
        vm.ifBit(nr, r, bit, this.register, other.register);
        return new Fp(nr);
    }

    eq(a: Fp): Register {

        if (Fp.optimizeHardcoded && this.register.hardcoded && a.register.hardcoded) {
            return this.register.getValue() == a.register.getValue() ? vm.hardcoded(1n) : vm.hardcoded(0n);
        }

        const f = vm.newRegister();
        vm.equal(f, this.register, a.register);
        return f;
    }

    add(a: Fp): Fp {

        if (Fp.optimizeHardcoded && this.register.hardcoded && a.register.hardcoded) {
            return Fp.hardcoded((this.register.getValue() + a.register.getValue()) % this.prime.getValue());
        }

        const t = vm.newRegister();
        vm.add(t, this.register, a.register, this.prime);
        return new Fp(t);
    }

    mul(a: Fp): Fp {

        if (Fp.optimizeHardcoded && this.register.hardcoded && a.register.hardcoded) {
            return Fp.hardcoded((this.register.getValue() * a.register.getValue()) % this.prime.getValue());
        }

        const t = vm.newRegister();
        vm.mul(t, this.register, a.register, this.prime);
        return new Fp(t);
    }

    sub(a: Fp): Fp {

        if (Fp.optimizeHardcoded && this.register.hardcoded && a.register.hardcoded) {
            return Fp.hardcoded((this.prime.getValue() + this.register.getValue() - a.register.getValue()) % this.prime.getValue());
        }

        const t = vm.newRegister();
        vm.sub(t, this.register, a.register, this.prime);
        return new Fp(t);
    }

    div(a: Fp): Fp {

        if (Fp.optimizeHardcoded && this.register.hardcoded && a.register.hardcoded) {
            const inv = modInverse(a.register.getValue(), this.prime.getValue()) as bigint;
            return Fp.hardcoded((this.register.getValue() * inv) % this.prime.getValue());
        }

        const t = vm.newRegister();
        vm.div(t, this.register, a.register, this.prime);
        return new Fp(t);
    }

    getRegister(): Register {
        return this.register;
    }

    neg(): Fp {
        return this.zero().sub(this);
    }

    toString(): String {
        return `${this.getRegister().getValue()}`;
    }
}
