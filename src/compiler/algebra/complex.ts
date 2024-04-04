import { Member } from "./member";
import { PrimeFieldMember } from "./prime-field";
import { divideComplex } from "../math-utils";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

export class Complex implements Member {

    prime: Register;
    coeffs: PrimeFieldMember[];

    constructor(prime: Register, coeffs?: PrimeFieldMember[]) {
        this.prime = prime;
        if (coeffs) {
            if (coeffs.length !== 2) throw new Error('Incorrect coeffs count');
            this.coeffs = coeffs;
        } else {
            this.coeffs = [];
            for (let i = 0; i < 2; i++) {
                this.coeffs.push(new PrimeFieldMember(prime));
            }
        }
    }

    getCoeff(i: number): PrimeFieldMember {
        return i < this.coeffs.length ? this.coeffs[i] : new PrimeFieldMember(this.prime, vm.R_0);
    }

    eq(a: Member): Register {
        const total = vm.newRegister();
        for (let i = 0; i < 2; i++) {
            const t = this.getCoeff(i).eq((a as any as Complex).getCoeff(i));
            vm.not(t, t);
            vm.add(total, total, t, vm.R_P0);
        }
        vm.equal(total, total, vm.R_0);
        return total;
    }

    add(a: Member): Member {
        const result = new Complex(this.prime);
        result.coeffs[0] = this.coeffs[0].add((a as Complex).coeffs[0]) as PrimeFieldMember;
        result.coeffs[1] = this.coeffs[1].add((a as Complex).coeffs[1]) as PrimeFieldMember;
        return result;
    }

    mul(_a: Member): Member {
        const a = _a as Complex;
        const result = new Complex(this.prime);
        result.coeffs[0] = this.coeffs[0].mul(a.coeffs[0]).sub(
            this.coeffs[1].mul(a.coeffs[1])) as PrimeFieldMember;
        result.coeffs[1] = this.coeffs[0].mul(a.coeffs[1]).add(
            this.coeffs[1].mul(a.coeffs[0])) as PrimeFieldMember;
        return result;
    }

    sub(a: Member): Member {
        const result = new Complex(this.prime);
        result.coeffs[0] = this.coeffs[0].sub((a as Complex).coeffs[0]) as PrimeFieldMember;
        result.coeffs[1] = this.coeffs[1].sub((a as Complex).coeffs[1]) as PrimeFieldMember;
        return result;
    }

    div(a: Member): Member {
        const rt = divideComplex(
            [
                this.coeffs[0].getRegister().getValue(),
                this.coeffs[1].getRegister().getValue()
            ],
            [
                (a as Complex).coeffs[0].getRegister().getValue(),
                (a as Complex).coeffs[1].getRegister().getValue()
            ],
            this.prime.getValue()
        );
        const r_r = vm.newRegister();
        vm.load(r_r, rt[0], 'complex div r');
        const r_i = vm.newRegister();
        vm.load(r_i, rt[1], 'complex div i');
        const result = new Complex(this.prime, [
            new PrimeFieldMember(this.prime, r_r),
            new PrimeFieldMember(this.prime, r_i)
        ]);
        const t = result.mul(a);
        const f = t.eq(this);
        vm.assertEqOne(f);
        return result;
    }

    if(r: Register, other: Member): Member {
        const c = new Complex(this.prime);
        for (let i = 0; i < 2; i++) {
            const t = this.coeffs[i].if(r, (other as Complex).coeffs[i]);
            c.coeffs[i] = t as PrimeFieldMember;
        }
        return c;
    }

    zero(): Member {
        return new Complex(this.prime, [
            new PrimeFieldMember(this.prime, vm.R_0),
            new PrimeFieldMember(this.prime, vm.R_0)
        ]);
    }
}

export class ComplexField {

    constructor(private prime: Register) {
    }

    newMember(r: Register, i: Register): Complex {
        return new Complex(this.prime, [
            new PrimeFieldMember(this.prime, r),
            new PrimeFieldMember(this.prime, i)
        ]);
    }
}

