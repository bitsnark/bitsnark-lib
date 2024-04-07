import { Member } from "./member";
import { vm } from "../vm/vm";
import { Register } from "../vm/state";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { modInverse } from "../math-utils";

export class Polynomial implements Member {

    primeField: PrimeField;
    coeffs: PrimeFieldMember[];
    degree: number;

    constructor(primeField: PrimeField, degree: number, coeffs?: PrimeFieldMember[]) {
        this.degree = degree;
        this.primeField = primeField;
        if (coeffs) {
            if (coeffs.length !== degree) throw new Error('Incorrect coeffs count');
            this.coeffs = coeffs;
        } else {
            this.coeffs = [];
            for (let i = 0; i < degree; i++) {
                this.coeffs.push(primeField.newMember());
            }
        }
    }

    validate(a: any): Polynomial {
        if (!(a instanceof Polynomial)) throw new Error('Invalid type');
        if (this.degree != a.degree) throw new Error('Invalid degree');
        return a;
    }

    getCoeff(i: number): PrimeFieldMember {
        return i < this.coeffs.length ? this.coeffs[i] : this.primeField.newMember(vm.R_0);
    }

    new(coeffs?: []) {
        return new Polynomial(this.primeField, this.degree, coeffs);
    }

    eq(_a: Member): Register {
        const a = this.validate(_a);
        const total = vm.newRegister();
        for (let i = 0; i < this.degree; i++) {
            const t = this.getCoeff(i).eq(a.getCoeff(i));
            vm.not(t, t);
            vm.add(total, total, t, vm.R_P0);
        }
        vm.equal(total, total, vm.R_0);
        return total;
    }

    add(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            vm.add(
                result.getCoeff(i).getRegister(),
                this.getCoeff(i).getRegister(),
                a.getCoeff(i).getRegister(),
                this.primeField.prime);
        }
        return result;
    }

    mul(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.new();
        const cache: Member[][] = [];
        for(let i = 0; i < this.degree; i++) cache[i] = [];
        for (let i = 0; i < this.degree; i++) {
            for (let j = 0; j < this.degree; j++) {
                let temp;
                if (cache[i][j]) {
                    temp = cache[i][j];
                } else {
                    temp = this.getCoeff(i).mul(a.getCoeff(j));
                    cache[j][i] = temp;
                }
                result.coeffs[i] = result.coeffs[i].add(temp) as PrimeFieldMember;
            }
        }
        return result;
    }

    sub(_a: Member): Member {
        const a = this.validate(_a);
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            result.coeffs[i] = this.coeffs[i].sub(a.coeffs[i]) as PrimeFieldMember;
        }
        return result;
    }

    div(_a: Member): Member {
        const a = this.validate(_a);
        const coeffs = polydiv(
            this.coeffs.map(m => m.getRegister().getValue()),
            a.coeffs.map(m => m.getRegister().getValue()),
            this.primeField.prime.getValue()).q;
        while (coeffs.length < this.degree) coeffs.push(0n);
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            vm.load(result.coeffs[i].getRegister(), coeffs[i]);
        }
        const m = result.mul(a);
        const f = m.eq(this);
        vm.assertEqOne(f);

        return result;
    }

    if(r: Register, _other: Member): Member {
        const other = this.validate(_other);
        const p = this.new();
        for (let i = 0; i < this.degree; i++) {
            const t = this.coeffs[i].if(r, other.coeffs[i]);
            p.coeffs[i] = t as PrimeFieldMember;
        }
        return p;
    }

    mod(a: Polynomial): Polynomial {
        this.validate(a);
        const q = this.div(a);
        const r = this.sub(q.mul(a));
        return r as Polynomial;
    }

    zero(): Member {
        return this.new();
    }

    neg(): Member {
        return this.zero().sub(this);
    }
}

export class PolynomialOverPrimeField {

    primeField: PrimeField;
    degree: number;

    constructor(primeField: PrimeField, degree: number) {
        this.primeField = primeField;
        this.degree = degree;
    }

    newMember(coeffs?: PrimeFieldMember[]): Polynomial {
        return new Polynomial(this.primeField, this.degree, coeffs);
    }
}

function polydiv(dividend: bigint[], divisor: bigint[], prime: bigint): { q: bigint[], r: bigint[] } {

    // Ensure the divisor is not zero
    if (divisor.length === 1 && divisor[0] === 0n) {
        throw new Error('Division by zero error');
    }

    // Initialize arrays to hold quotient and remainder
    let quotient: bigint[] = [];
    let remainder: bigint[] = [...dividend];

    // Perform polynomial division
    while (remainder.length >= divisor.length) {
        // Calculate the quotient term
        const leadingTermDividend = remainder[0];
        const leadingTermDivisor = divisor[0];
        const quotientTerm = (leadingTermDividend * modInverse(leadingTermDivisor, prime)) % prime;

        // Add the quotient term to the result
        quotient.push(quotientTerm);

        // Subtract the divisor multiplied by the quotient term from the remainder
        for (let i = 0; i < divisor.length; i++) {
            remainder[i] = (prime + remainder[i] - quotientTerm * divisor[i]) % prime;
        }

        // Remove any leading zeros from the remainder
        while (remainder.length > 0 && remainder[0] === 0n) {
            remainder.shift();
        }
    }

    return { q: quotient, r: remainder };
}
