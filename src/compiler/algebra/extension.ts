import { Member } from "./member";
import { vm } from "../vm";
import { Register } from "../register";

export class ExtensionMember implements Member {

    private prime: Register;
    private register: Register;

    constructor(prime: Register, r?: Register) {
        this.prime = prime;
        this.register = r ?? new Register();
    }

    ifBit(r: Register, bit: number, other: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.mov(t.register, this.register);
        vm.andbit(t.register, this.register, bit, (other as any as PrimeFieldMember).register);
        return t;
    }

    eq(a: Member): Register {
        const f = new Register();
        vm.equal(f, this.register, (a as any as PrimeFieldMember).register);
        return f;
    }

    add(a: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.add(this.register, this.register, (a as any as PrimeFieldMember).register, this.prime);
        return t;
    }

    mul(a: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.mul(this.register, this.register, (a as any as PrimeFieldMember).register, this.prime);
        return t;
    }

    sub(a: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.sub(this.register, this.register, (a as any as PrimeFieldMember).register, this.prime);
        return t;
    }

    div(a: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.div(this.register, this.register, (a as any as PrimeFieldMember).register, this.prime);
        return t;
    }

    getRegister(): Register {
        return this.register;
    }
}

export class Extension {

    private prime: Register;

    constructor(prime: Register) {
        this.prime = prime;
    }

    newMember(r?: Register): PrimeFieldMember {
        return new PrimeFieldMember(this.prime, r);
    }
}
