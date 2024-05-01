import { vm } from "../vm/vm";
import { GcExceptable, Register } from "../vm/state";
import { Fp } from "./fp";
import { Poly12 } from "./poly12";

export class Fp12 implements GcExceptable {

    polymod = Poly12.hardcoded([82n, 0n, 0n, 0n, 0n, 0n, -18n, 0n, 0n, 0n, 0n, 0n]);
    value: Poly12;

    constructor(value?: Poly12) {
        this.value = value ? value : new Poly12();
    }

    getRegisters(): Register[] {
        return this.value.getRegisters();
    }

    static hardcoded(coeffs: bigint[]): Fp12 {
        return new Fp12(Poly12.hardcoded(coeffs));
    }

    static one(): Fp12 {
        return new Fp12(Poly12.hardcoded([1n]));
    }

    static zero(): Fp12 {
        return new Fp12();
    }

    one(): Fp12 {
        return new Fp12(Poly12.hardcoded([1n]));
    }

    zero(): Fp12 {
        return new Fp12();
    }

    eq(a: Fp12): Register {
        return this.value.eq(a.value);
    }

    add(a: Fp12): Fp12 {
        return new Fp12(this.value.add(a.value));
    }

    mul(a: Fp | Fp12): Fp12 {
        if (a instanceof Fp)
            return new Fp12(this.value.mul(a));
        return new Fp12(this.value.mulMod(a.value, this.polymod));
    }

    sub(a: Fp12): Fp12 {
        return new Fp12(this.value.sub(a.value));
    }

    div(a: Fp | Fp12): Fp12 {
        if (a instanceof Fp)
            return new Fp12(this.value.div(a));
        return new Fp12(this.value.divMod(a.value, this.polymod));
    }

    if(r: Register, other: Fp12): Fp12 {
        return new Fp12(this.value.if(r, other.value));
    }

    ifBit(r: Register, bit: number, other: Fp12): Fp12 {
        const fpa: Fp[] = [];
        for (let i = 0; i < this.value.coeffs.length; i++) {
            fpa.push(this.value.coeffs[i].ifBit(r, bit, other.value.coeffs[i]));
        }
        return new Fp12(new Poly12(fpa));
    }

    neg(): Fp12 {
        return this.zero().sub(this);
    }

    powHardcoded(e: bigint): Fp12 {
        let result = this.one();
        let agg = this as Fp12;
        for (let i = 0; e > 0; i++) {
            if (e & 1n) result = result.mul(agg);
            e = e >> 1n;
            if (e > 0) agg = agg.mul(agg);
        }
        return result;
    }

    toString(): String {
        return this.value.toString();
    }
}
