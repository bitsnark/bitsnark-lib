import { Register } from "../../common/register";
import { step1_vm as vm } from "../vm/vm";
import { Fp } from "./fp";
import { Fp2 } from "./fp2";
import { Fp6 } from "./fp6";

// xiToPMinus1Over6 is ξ^((p-1)/6) where ξ = i+9.
const xiToPMinus1Over6 = Fp2.hardcoded(
    16469823323077808223889137241176536799009286646108169935659301613961712198316n,
    8376118865763821496583973867626364092589906065868298776909617916018768340080n);
    
// xiToPSquaredMinus1Over6 is ξ^((1p²-1)/6) where ξ = i+9 (a cubic root of -1, mod p).
const xiToPSquaredMinus1Over6 = Fp.hardcoded(21888242871839275220042445260109153167277707414472061641714758635765020556617n);

export class Fp12t {

    x: Fp6;
    y: Fp6;

    constructor(x?: Fp6, y?: Fp6) {
        this.x = x ? x : new Fp6();
        this.y = y ? y : new Fp6();
    }

    getRegisters(): Register[] {
        return [...this.x.getRegisters(), ...this.y.getRegisters()];
    }

    static zero(): Fp12t {
        return new Fp12t();
    }

    static one(): Fp12t {
        return new Fp12t(Fp6.zero(), Fp6.one());
    }

    zero(): Fp12t {
        return new Fp12t();
    }

    one(): Fp12t {
        return Fp12t.one();
    }

    eq(a: Fp12t): Register {
        const r = vm.newRegister();
        const f1 = this.x.eq(a.x);
        const f2 = this.y.eq(a.y);
        vm.and(r, f1, f2);
        return r;
    }

    add(a: Fp12t): Fp12t {
        return new Fp12t(this.x.add(a.x), this.y.add(a.y));
    }

    sub(a: Fp12t): Fp12t {
        return new Fp12t(this.x.sub(a.x), this.y.sub(a.y));
    }

    mul(a: Fp | Fp6 | Fp12t): Fp12t {
        if (a instanceof Fp || a instanceof Fp6) {
            return new Fp12t(this.x.mul(a), this.y.mul(a));
        }

        let tx = this.x.mul(a.y);
        let t = a.x.mul(this.y);
        tx = tx.add(t);

        let ty = this.y.mul(a.y);
        t = this.x.mul(a.x);
        t = t.mulTau();
        ty = ty.add(t);

        return new Fp12t(tx, ty);
    }

    // See "Implementing cryptographic pairings", M. Scott, section 3.2.
    // ftp://136.206.11.249/pub/crypto/pairings.pdf
    inv(): Fp12t {
        let t1 = this.x.mul(this.x).mulTau();
        let t2 = this.y.mul(this.y);
        t1 = t2.sub(t1);
        t2 = t1.inv();

        return new Fp12t(this.x.neg(), this.y).mul(t2);
    }

    div(a: Fp | Fp6 | Fp12t): Fp12t {
        return this.mul(a.inv());
    }

    if(r: Register, other: Fp12t): Fp12t {
        return new Fp12t(this.x.if(r, other.x), this.y.if(r, other.y));
    }

    ifBit(r: Register, bit: number, other: Fp12t): Fp12t {
        return new Fp12t(this.x.ifBit(r, bit, other.x), this.x.ifBit(r, bit, other.y));
    }

    neg(): Fp12t {
        return this.zero().sub(this);
    }

    powHardcoded(e: bigint): Fp12t {
        let result = this.one();
        let agg = this as Fp12t;
        for (let i = 0; e > 0; i++) {
            if (e & 1n) result = result.mul(agg);
            e = e >> 1n;
            if (e > 0) agg = agg.mul(agg);
        }
        return result;
    }

    conj(): Fp12t {
        return new Fp12t(this.x.neg(), this.y);
    }

    // Frobenius computes (xω+y)^p = x^p ω·ξ^((p-1)/6) + y^p
    frobenius(): Fp12t {
        const r = this.zero();
	    r.x = this.x.frobenius();
        r.y = this.y.frobenius();
        r.x = r.x.mul(xiToPMinus1Over6);
	    return r;
    }

    // FrobeniusP2 computes (xω+y)^p² = x^p² ω·ξ^((p²-1)/6) + y^p²
    frobeniusP2(): Fp12t {
        const r = this.zero();
        r.x = this.x.frobeniusP2();
	    r.x = r.x.mul(xiToPSquaredMinus1Over6)
	    r.y = this.y.frobeniusP2();
	    return r;
    }

    assertOne() {
        this.x.assertZero();
        this.y.assertOne();
    }

    toString(): string {
        return `[${this.x.toString()}, ${this.y.toString()}]`;
    }
}
