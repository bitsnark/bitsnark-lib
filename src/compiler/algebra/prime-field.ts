import { Member } from "./member";
import { vm } from "../vm/vm";
import { Register } from "../vm/state";
import { modPow } from "../math-utils";

export class PrimeFieldMember implements Member {

    private prime: Register;
    private register: Register;

    constructor(prime: Register, r?: Register) {
        this.prime = prime;
        if (r && r.value < 0) {
            r.forceValue((prime.getValue() + r.getValue()) % prime.getValue());
        }
        this.register = r ?? vm.newRegister();
    }

    new(r?: Register) {
        return new PrimeFieldMember(this.prime, r);
    }

    validate(a: any): PrimeFieldMember {
        if (!(a instanceof PrimeFieldMember))
            throw new Error('Invalid type');
        return a;
    }

    if(r: Register, other: Member): Member {
        const result = new PrimeFieldMember(this.prime);
        vm.ifThenElse(result.getRegister(), r, this.getRegister(), (other as PrimeFieldMember).getRegister());
        return result;
    }

    eq(_a: Member): Register {
        const a = this.validate(_a);
        const f = vm.newRegister();
        vm.equal(f, this.register, a.register);
        return f;
    }

    add(_a: Member): Member {
        const a = this.validate(_a);
        const t = vm.newRegister();
        vm.add(t, this.register, a.register, this.prime);
        return this.new(t);
    }

    mul(_a: Member): Member {
        const a = this.validate(_a);
        const t = vm.newRegister();
        vm.mul(t, this.register, a.register, this.prime);
        return this.new(t);
    }

    sub(_a: Member): Member {
        const a = this.validate(_a);
        const t = vm.newRegister();
        vm.sub(t, this.register, a.register, this.prime);
        return this.new(t);
    }

    div(_a: Member): Member {
        const a = this.validate(_a);
        const t = vm.newRegister();
        vm.div(t, this.register, a.register, this.prime);
        return this.new(t);
    }

    getRegister(): Register {
        return this.register;
    }

    zero(): Member {
        return this.new();
    }

    neg(): Member {
        return this.zero().sub(this);
    }

    pow(e: PrimeFieldMember): PrimeFieldMember {
        if (this.register.hardcoded && e.register.hardcoded) {
            const r = this.new();
            vm.mov(r.register, 
                vm.hardcoded(modPow(this.register.getValue(), e.register.getValue(), this.prime.getValue())));
            return r;
        }
        const agg = vm.newRegister();
        vm.mov(agg, this.register);
        const r_temp = vm.newRegister();
        const result = vm.hardcoded(1n);
        for (let bit = 0; bit < 256; bit++) {
            const bv = e.register.getValue() >> BigInt(bit) & 1n;
            if (!e.register.hardcoded || bv) {
                vm.andbit(r_temp, e.register, bit, agg);
                vm.mul(result, result, r_temp, this.prime);
            }
            if (bit < 255) vm.mul(agg, agg, agg, this.prime);
        }
        return this.new(result);
    }
}

export class PrimeField {

    prime: Register;

    constructor(prime: Register) {
        this.prime = prime;
    }

    newMember(r?: Register): PrimeFieldMember {
        return new PrimeFieldMember(this.prime, r);
    }

    getPrime(): PrimeFieldMember {
        return this.newMember(this.prime);
    }
}
