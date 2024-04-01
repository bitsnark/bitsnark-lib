import { Member } from "./member";
import { vm } from "../vm/vm";
import { R_0, R_MAX, Register } from "../vm/register";
import { PrimeFieldMember } from "./prime-field";

export class Polynomial implements Member {

    prime: Register;
    coeffs: PrimeFieldMember[];
    count: number;

    constructor(prime: Register, count: number, coeffs?: PrimeFieldMember[]) {
        this.count = count;
        this.prime = prime;
        if (coeffs) {
            if (coeffs.length !== count) throw new Error('Incorrect coeffs count');
            this.coeffs = coeffs;
        } else {
            this.coeffs = [];
            for (let i = 0; i < count; i++) {
                this.coeffs.push(new PrimeFieldMember(prime));
            }
        }
    }

    getCoeff(i: number): PrimeFieldMember {
        return i < this.coeffs.length ? this.coeffs[i] : new PrimeFieldMember(this.prime, R_0);
    }

    eq(a: Member): Register {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const total = new Register();
        for (let i = 0; i < this.count; i++) {
            const t = this.getCoeff(i).eq((a as any as Polynomial).getCoeff(i));
            vm.not(t, t);
            vm.add(total, total, t, R_MAX);
        }
        vm.equal(total, total, R_0);
        return total;
    }

    add(a: Member): Member {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const result = new Polynomial(this.prime, this.count);
        for (let i = 0; i < this.count; i++) {
            vm.add(
                result.getCoeff(i).getRegister(),
                this.getCoeff(i).getRegister(),
                (a as any as Polynomial).getCoeff(i).getRegister(),
                this.prime);
        }
        return result;
    }

    mul(a: Member): Member {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const result = new Polynomial(this.prime, this.count);
        for (let i = 0; i < this.count; i++) {
            for (let j = 0; j < this.count; j++) {
                const temp = this.getCoeff(i).mul((a as Polynomial).getCoeff(j));
                result.coeffs[i + j] = result.coeffs[i + j].add(temp) as PrimeFieldMember;
            }
        }
        return result;
    }

    sub(a: Member): Member {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const result = new Polynomial(this.prime, this.count);
        for (let i = 0; i < this.count; i++) {
            result.coeffs[i] = this.coeffs[i].sub((a as Polynomial).coeffs[i]) as PrimeFieldMember;
        }
        return result;
    }

    div(a: Member): Member {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const coeffs = polydiv(
            this.coeffs.map(m => m.getRegister().getValue()),
            (a as Polynomial).coeffs.map(m => m.getRegister().getValue()),
            this.prime.getValue()).q;
        while (coeffs.length < this.count) coeffs.push(0n);
        const result = new Polynomial(this.prime, this.count);
        for (let i = 0; i < this.count; i++) {
            vm.load(result.coeffs[i].getRegister(), coeffs[i], 'polynomial_div');
        }
        const m = result.mul(a);
        const f = m.eq(this);
        vm.assertEqOne(f);

        return result;
    }

    ifBit(r: Register, bit: number, other: Member): Member {
        const p = new Polynomial(this.prime, this.count);
        for (let i = 0; i < this.count; i++) {
            const t = this.coeffs[i].ifBit(r, bit, (other as Polynomial).coeffs[i]);
            p.coeffs[i] = t as PrimeFieldMember;
        }
        return p;
    }

    mod(a: Polynomial): Polynomial {
        if (this.count !== (a as any as Polynomial).count)
            throw new Error('Incompatible polynomials');
        const q = this.div(a);
        const r = this.sub(q.mul(a));
        return r as Polynomial;
    }

    zero(): Member {
        return new Polynomial(this.prime, this.count, this.coeffs.map(c => c.zero() as PrimeFieldMember));
    }
}

export class PolynomialOverPrimeField {

    constructor(private prime: Register, private count: number) {
    }

    newMember(r?: Register): Polynomial {
        return new Polynomial(this.prime, this.count);
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

function modInverse(a: bigint, m: bigint): bigint {

    // validate inputs
    a = (a % m + m) % m;
    if (!a || m < 2) {
        throw new Error('NaN 1');
    }

    // find the gcd
    const s = [];
    let b = m;
    while (b) {
        [a, b] = [b, a % b];
        s.push({ a, b });
    }
    if (a !== 1n) {
        throw new Error('NaN 2');
    }

    // find the inverse
    let x = 1n;
    let y = 0n;
    for (let i = s.length - 2; i >= 0; --i) {
        [x, y] = [y, x - y * (s[i].a / s[i].b)];
    }

    return (y % m + m) % m;
}
