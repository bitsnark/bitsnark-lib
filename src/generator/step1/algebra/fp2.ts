import { Fp } from "./fp";
import { vm } from "../vm/vm";
import { prime_bigint } from "../vm/prime";
import { divideComplex } from "../../common/math-utils";
import { Register } from "../../common/register";

const _2__3 = Fp.hardcoded(2n ** 3n);

export class Fp2 {

    r: Fp;
    i: Fp;

    constructor(r?: Fp, i?: Fp) {
        this.r = r ? r : Fp.zero();
        this.i = i ? i : Fp.zero();
    }

    // free() {
    //     this.r.free();
    //     this.i.free();
    // }

    getRegisters(): Register[] {
        return [...this.r.getRegisters(), ...this.i.getRegisters()];
    }

    static hardcoded(r: bigint, i: bigint): Fp2 {
        return new Fp2(Fp.hardcoded(r), Fp.hardcoded(i));
    }

    zero(): Fp2 {
        return new Fp2();
    }

    one(): Fp2 {
        return new Fp2(Fp.hardcoded(1n), Fp.hardcoded(0n));
    }

    static zero(): Fp2 {
        return new Fp2();
    }

    static one(): Fp2 {
        return new Fp2(Fp.hardcoded(1n), Fp.hardcoded(0n));
    }

    eq(a: Fp2): Register {
        const f1 = this.r.eq(a.r);
        const f2 = this.i.eq(a.i);
        const r = vm.newRegister();
        vm.and(r, f1, f2);
        return r;
    }

    add(a: Fp2): Fp2 {
        return new Fp2(this.r.add(a.r), this.i.add(a.i));
    }

    mul(a: Fp | Fp2): Fp2 {
        if (a instanceof Fp) {
            return new Fp2(
                this.r.mul(a),
                this.i)
        }
        return new Fp2(
            this.r.mul(a.r).sub(this.i.mul(a.i)),
            this.r.mul(a.i).add(this.i.mul(a.r)));
    }

    sub(a: Fp2): Fp2 {
        return new Fp2(this.r.sub(a.r), this.i.sub(a.i));
    }

    inv(): Fp2 {
        return this.one().div(this);
    }

    div(a: Fp2): Fp2 {
        const denom = a.r.mul(a.r).add(a.i.mul(a.i));
        if (denom.register.value === 0n) {
            // can't fail!
            return this.zero();
        }

        const r = this.r.mul(a.r).add(this.i.mul(a.i)).div(denom);
        const i = this.i.mul(a.r).sub(this.r.mul(a.i)).div(denom);
        return new Fp2(r, i);
    }

    if(flag: Register, other: Fp2): Fp2 {
        return new Fp2(
            this.r.if(flag, other.r),
            this.i.if(flag, other.i));
    }

    ifBit(r: Register, bit: number, other: Fp2): Fp2 {
        return new Fp2(
            this.r.ifBit(r, bit, other.r),
            this.i.ifBit(r, bit, other.i));
    }

    neg(): Fp2 {
        return this.zero().sub(this);
    }

    conj(): Fp2 {
        return new Fp2(this.r, this.i.neg());
    }

    toString(): string {
        return `[${this.r.toString()}, ${this.i.toString()}]`;
    }

    // MulXi returns ξthis where ξ=i+9
    mulXi(): Fp2 {
	    // (xi+y)(i+3) = (9x+y)i+(9y-x)
	    let tr = this.r.mul(_2__3).add(this.r).add(this.i);
        let ti = this.i.mul(_2__3).add(this.i).sub(this.r);
        return new Fp2(tr, ti);
    }
}
