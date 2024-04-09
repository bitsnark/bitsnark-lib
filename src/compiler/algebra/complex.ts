import { Member } from "./member";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { divideComplex } from "../math-utils";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

export class Complex implements Member {

    primeField: PrimeField;
    r: PrimeFieldMember;
    i: PrimeFieldMember;

    constructor(primeField: PrimeField, r?: PrimeFieldMember, i?: PrimeFieldMember) {
        this.primeField = primeField;
        this.r = r ? r : primeField.newMember();
        this.i = i ? i : primeField.newMember();
    }

    validate(a: any): Complex {
        if (!(a instanceof Complex)) throw new Error('Invalid type');
        return a as Complex;
    }

    new(r: PrimeFieldMember, i: PrimeFieldMember): Complex {
        return new Complex(this.primeField, r, i);
    }

    eq(_a: Member): Register {
        const a = this.validate(_a);
        const f1 = this.r.eq(a.r) as Register;
        const f2 = this.i.eq(a.i) as Register;
        vm.and(f1, f1, f2);
        return f1;
    }

    add(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.zero() as Complex;
        result.r = this.r.add(a.r) as PrimeFieldMember;
        result.i = this.i.add(a.i) as PrimeFieldMember;
        return result;
    }

    mul(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.zero() as Complex;
        result.r = this.r.mul(a.r).sub(
            this.i.mul(a.i)) as PrimeFieldMember;
        result.i = this.r.mul(a.i).add(
            this.i.mul(a.r)) as PrimeFieldMember;
        return result;
    }

    sub(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.zero() as Complex;
        result.r = this.r.sub(a.r) as PrimeFieldMember;
        result.i = this.i.sub(a.i) as PrimeFieldMember;
        return result;
    }

    div(_a: Member): Member {
        const a = this.validate(_a);
        const rt = divideComplex(
            [
                this.r.getRegister().getValue(),
                this.i.getRegister().getValue()
            ],
            [
                a.r.getRegister().getValue(),
                a.i.getRegister().getValue()
            ],
            this.primeField.prime.getValue()
        );
        const r_r = vm.newRegister();
        vm.load(r_r, rt[0]);
        const r_i = vm.newRegister();
        vm.load(r_i, rt[1]);
        const result = this.new(
            this.primeField.newMember(r_r),
            this.primeField.newMember(r_i)
        );
        const t = result.mul(a);
        const f = t.eq(this);
        vm.assertEqOne(f);
        return result;
    }

    if(flag: Register, _other: Member): Member {
        const other = this.validate(_other);
        const c = this.zero() as Complex;
        c.r = this.r.if(flag, other.r) as PrimeFieldMember;
        c.i = this.r.if(flag, other.i) as PrimeFieldMember;
        return c;
    }

    zero(): Member {
        return new Complex(this.primeField,
            this.r.zero() as PrimeFieldMember,
            this.r.zero() as PrimeFieldMember
        );
    }

    neg(): Member {
        return this.zero().sub(this);
    }

    pow(a: Member): Member {
        throw new Error('Not implemented');
    }
}

export class ComplexField {

    primeField: PrimeField;

    constructor(primeField: PrimeField) {
        this.primeField = primeField;
    }

    newMember(r: Register, i: Register): Complex {
        return new Complex(this.primeField,
            this.primeField.newMember(r),
            this.primeField.newMember(i)
        );
    }
}
