import { vm } from "../vm/vm";
import { Fp } from "./fp";
import { prime_bigint } from "../vm/prime";
import { Register } from "../../common/register";
import { polyInv } from "../../common/math-utils";

const DEGREE = 12;

export class Poly12 {

    coeffs: Fp[];

    constructor(coeffs?: Fp[]) {
        coeffs = coeffs ? coeffs : [];
        if (coeffs.length > DEGREE) throw new Error('Invalid coeffs count');
        while (coeffs.length < DEGREE) coeffs.push(new Fp());
        this.coeffs = coeffs;
    }

    // free() {
    //     this.coeffs.forEach(c => c.free());
    // }

    getRegisters(): Register[] {
        return this.coeffs.map(c => c.getRegisters()).flat();
    }

    static hardcoded(coeffs: bigint[]): Poly12 {
        return new Poly12(coeffs.map(n => Fp.hardcoded(n)));
    }

    one() {
        return Poly12.hardcoded([1n]);
    }

    zero() {
        return new Poly12();
    }

    static one() {
        return Poly12.hardcoded([1n]);
    }

    static zero() {
        return new Poly12();
    }

    eq(a: Poly12): Register {
        const total = vm.newRegister(true);
        for (let i = 0; i < DEGREE; i++) {
            const t = this.coeffs[i].eq(a.coeffs[i]);
            vm.not(t, t);
            vm.addMod(total, total, t);
        }
        vm.equal(total, total, vm.zero);
        return total;
    }

    add(a: Poly12): Poly12 {
        const result = new Poly12();
        for (let i = 0; i < DEGREE; i++) {
            result.coeffs[i] = this.coeffs[i].add(a.coeffs[i]);
        }
        return result;
    }

    mul(a: Fp): Poly12 {
        const result = new Poly12();
        for (let i = 0; i < DEGREE; i++) {
            result.coeffs[i] = this.coeffs[i].mul(a);
        }
        return result;
    }

    div(a: Fp): Poly12 {
        const result = new Poly12();
        for (let i = 0; i < DEGREE; i++) {
            result.coeffs[i] = this.coeffs[i].div(a);
        }
        return result;
    }

    sub(a: Poly12): Poly12 {
        const result = new Poly12();
        for (let i = 0; i < DEGREE; i++) {
            result.coeffs[i] = this.coeffs[i].sub(a.coeffs[i]);
        }
        return result;
    }

    if(r: Register, other: Poly12): Poly12 {
        const p = new Poly12();
        for (let i = 0; i < DEGREE; i++) {
            const t = this.coeffs[i].if(r, other.coeffs[i]);
            p.coeffs[i] = t as Fp;
        }
        return p;
    }

    neg(): Poly12 {
        const result = this.zero().sub(this);
        return result;
    }

    toString(): String {
        return `[${this.coeffs.map(v => v.toString()).join(',')}]`;
    }

    mulMod(a: Poly12, b: Poly12): Poly12 {
        const temp: Fp[] = [];
        for (let i = 0; i < DEGREE * 2; i++) temp[i] = new Fp();
        for (let i = 0; i < DEGREE; i++) {
            for (let j = 0; j < DEGREE; j++) {
                temp[i + j] = temp[i + j].add(this.coeffs[i].mul(a.coeffs[j]));
            }
        }
        while (temp.length > DEGREE) {
            const exp = temp.length - DEGREE - 1;
            const top = temp.pop()!;
            for (let i = 0; i < DEGREE; i++) {
                temp[exp + i] = temp[exp + i].sub(top.mul(b.coeffs[i]));
            }
        }
        const result = new Poly12(temp);
        return result;
    }

    divMod(a: Poly12, b: Poly12): Poly12 {
        const inv = polyInv(
            a.coeffs.map(fp => fp.register.value),
            b.coeffs.map(fp => fp.register.value),
            12,
            prime_bigint);
        const pinv = new Poly12(inv.map(n => {
            const r =  vm.newRegister();
            r.value = n;
            return new Fp(r);
        }));
        const test = a.mulMod(pinv, b);
        const f = test.eq(a.one());
        //vm.assertEqOne(f);
        const result = this.mulMod(pinv, b)
        return result;
    }
}
