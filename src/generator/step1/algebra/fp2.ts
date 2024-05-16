import { Fp } from "./fp";
import { vm } from "../vm/vm";
import { prime_bigint } from "../vm/prime";
import { divideComplex } from "../../common/math-utils";
import { Register } from "../../common/register";

export class Fp2 {

    r: Fp;
    i: Fp;

    constructor(r?: Fp, i?: Fp) {
        this.r = r ? r : new Fp(vm.hardcode(0n));
        this.i = i ? i : new Fp(vm.hardcode(0n));
    }

    getRegisters(): Register[] {
        return [...this.r.getRegisters(), ...this.i.getRegisters()];
    }

    static hardcoded(r: bigint, i: bigint): Fp2 {
        return new Fp2(
            new Fp(vm.hardcode(r)),
            new Fp(vm.hardcode(i))
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
        if (a.r.register.value === 0n && a.i.register.value === 0n) {
            // can't fail!
            return this.zero();
        }
        const conj = a.conj();
        const num = this.mul(conj);
        const sqrd = this.r.mul(a.r).add(this.i.mul(a.i));
        return new Fp2(num.r.div(sqrd), num.i.div(sqrd));
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
        return `[${this.r}, ${this.i}]`;
    }
}
