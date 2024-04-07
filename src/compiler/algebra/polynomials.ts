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

    getCoeff(i: number): PrimeFieldMember {
        return i < this.coeffs.length ? this.coeffs[i] : this.primeField.newMember(vm.R_0);
    }

    new(coeffs?: []) {
        return new Polynomial(this.primeField, this.degree, coeffs);
    }

    eq(a: Member): Register {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
        const total = vm.newRegister();
        for (let i = 0; i < this.degree; i++) {
            const t = this.getCoeff(i).eq((a as any as Polynomial).getCoeff(i));
            vm.not(t, t);
            vm.add(total, total, t, vm.R_P0);
        }
        vm.equal(total, total, vm.R_0);
        return total;
    }

    add(a: Member): Member {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            vm.add(
                result.getCoeff(i).getRegister(),
                this.getCoeff(i).getRegister(),
                (a as any as Polynomial).getCoeff(i).getRegister(),
                this.primeField.prime);
        }
        return result;
    }

    mul(a: Member): Member {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            for (let j = 0; j < this.degree; j++) {
                const temp = this.getCoeff(i).mul((a as Polynomial).getCoeff(j));
                result.coeffs[i + j] = result.coeffs[i + j].add(temp) as PrimeFieldMember;
            }
        }
        return result;
    }

    sub(a: Member): Member {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            result.coeffs[i] = this.coeffs[i].sub((a as Polynomial).coeffs[i]) as PrimeFieldMember;
        }
        return result;
    }

    div(a: Member): Member {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
        const coeffs = polydiv(
            this.coeffs.map(m => m.getRegister().getValue()),
            (a as Polynomial).coeffs.map(m => m.getRegister().getValue()),
            this.primeField.prime.getValue()).q;
        while (coeffs.length < this.degree) coeffs.push(0n);
        const result = this.new();
        for (let i = 0; i < this.degree; i++) {
            vm.load(result.coeffs[i].getRegister(), coeffs[i], 'polynomial_div');
        }
        const m = result.mul(a);
        const f = m.eq(this);
        vm.assertEqOne(f);

        return result;
    }

    if(r: Register, other: Member): Member {
        const p = this.new();
        for (let i = 0; i < this.degree; i++) {
            const t = this.coeffs[i].if(r, (other as Polynomial).coeffs[i]);
            p.coeffs[i] = t as PrimeFieldMember;
        }
        return p;
    }

    mod(a: Polynomial): Polynomial {
        if (this.degree !== (a as any as Polynomial).degree)
            throw new Error('Incompatible polynomials');
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
            remainder[i] -= quotientTerm * divisor[i];
        }

        // Remove any leading zeros from the remainder
        while (remainder.length > 0 && remainder[0] === 0n) {
            remainder.shift();
        }
    }

    return { q: quotient, r: remainder };
}
