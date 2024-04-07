import { Member } from "./member";
import { vm } from "../vm/vm";
import { Register } from "../vm/state";

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
        const t = new PrimeFieldMember(this.prime);
        vm.add(t.register, this.register, a.register, this.prime);
        return t;
    }

    mul(_a: Member): Member {
        const a = this.validate(_a);
        const t = new PrimeFieldMember(this.prime);
        vm.mul(t.register, this.register, a.register, this.prime);
        return t;
    }

    sub(_a: Member): Member {
        const a = this.validate(_a);
        const t = new PrimeFieldMember(this.prime);
        vm.sub(t.register, this.register, a.register, this.prime);
        return t;
    }

    div(_a: Member): Member {
        const a = this.validate(_a);
        const t = new PrimeFieldMember(this.prime);
        vm.div(t.register, this.register, a.register, this.prime);
        return t;
    }

    getRegister(): Register {
        return this.register;
    }

    zero(): Member {
        return new PrimeFieldMember(this.prime, vm.R_0);
    }

    neg(): Member {
        return this.zero().sub(this);
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
}
