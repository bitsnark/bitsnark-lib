import { Fp, prime_bigint } from "./fp";
import { divideComplex } from "../common/math-utils";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

export class Fp2 {

    r: Fp;
    i: Fp;

    constructor(r?: Fp, i?: Fp) {
        this.r = r ? r : new Fp(vm.hardcoded(0n));
        this.i = i ? i : new Fp(vm.hardcoded(0n));
    }

    static hardcoded(r: bigint, i: bigint): Fp2 {
        return new Fp2(
            new Fp(vm.hardcoded(r)),
            new Fp(vm.hardcoded(i))
        );
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

    mul(a: Fp2): Fp2 {
        return new Fp2(
            this.r.mul(a.r).sub(this.i.mul(a.i)),
            this.r.mul(a.i).add(this.i.mul(a.r)));
    }

    sub(a: Fp2): Fp2 {
        return new Fp2(this.r.sub(a.r), this.i.sub(a.i));
    }

    div(a: Fp2): Fp2 {
        const rt = divideComplex(
            [
                this.r.getRegister().getValue(),
                this.i.getRegister().getValue()
            ],
            [
                a.r.getRegister().getValue(),
                a.i.getRegister().getValue()
            ],
            prime_bigint
        );
        const r_r = vm.newRegister();
        vm.load(r_r, rt[0]);
        const r_i = vm.newRegister();
        vm.load(r_i, rt[1]);
        const result = new Fp2(
            new Fp(r_r),
            new Fp(r_i)
        );
        const t = result.mul(a);
        const f = t.eq(this);
        vm.assertEqOne(f);
        return result;
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

    toString(): String {
        return `[${this.r}, ${this.i}]`;
    }
}
