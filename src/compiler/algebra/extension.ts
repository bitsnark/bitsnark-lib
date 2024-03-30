import { Member } from "./member";
import { vm } from "../vm";
import { R_MAX, Register } from "../register";

export class ExtensionMember implements Member {

    private primeCoeffs: Register[];
    private coeffs: Register[];
    private degree: Register;

    constructor(primeCoeffs: Register[], coeffs?: Register[]) {
        this.primeCoeffs = primeCoeffs;
        this.coeffs = coeffs ?? primeCoeffs.map(() => new Register());
        this.degree = Register.hardcoded(BigInt(primeCoeffs.length));
    }

    eq(a: Member): Register {
        if (this.degree.getValue() !== (a as any as ExtensionMember).degree.getValue())
            throw new Error('Incompatible polynomials');
        const total = new Register();
        const f = new Register();
        for (let i = 0; i < this.primeCoeffs.length; i++) {
            vm.equal(f, this.coeffs[i], (a as any as ExtensionMember).coeffs[i]);
            vm.add(total, total, f, R_MAX);
        }
        vm.equal(f, total, this.degree);
        return f;
    }

    add(a: Member): Member {
        if (this.degree.getValue() !== (a as any as ExtensionMember).degree.getValue())
            throw new Error('Incompatible polynomials');
        

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

    ifBit(r: Register, bit: number, other: Member): Member {
        const t = new PrimeFieldMember(this.prime);
        vm.mov(t.register, this.register);
        vm.andbit(t.register, this.register, bit, (other as any as PrimeFieldMember).register);
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
