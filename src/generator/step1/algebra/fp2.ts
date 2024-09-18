import { Fp } from "./fp";
import { Register } from "../../common/register";
import { step1_vm as vm } from "../vm/vm";

const _2__3 = Fp.hardcoded(2n ** 3n);

export class Fp2 {

    // xi + y

    x: Fp;
    y: Fp;

    constructor(x?: Fp, y?: Fp) {
        this.x = x ? x : Fp.zero();
        this.y = y ? y : Fp.zero();
    }

    getRegisters(): Register[] {
        return [...this.x.getRegisters(), ...this.y.getRegisters()];
    }

    static hardcoded(x: bigint, y: bigint): Fp2 {
        return new Fp2(Fp.hardcoded(x), Fp.hardcoded(y));
    }

    zero(): Fp2 {
        return new Fp2();
    }

    one(): Fp2 {
        return new Fp2(Fp.hardcoded(0n), Fp.hardcoded(1n));
    }

    static zero(): Fp2 {
        return new Fp2();
    }

    static one(): Fp2 {
        return new Fp2(Fp.hardcoded(0n), Fp.hardcoded(1n));
    }

    eq(a: Fp2): Register {
        const f1 = this.x.eq(a.x);
        const f2 = this.y.eq(a.y);
        const r = vm.newRegister();
        vm.and(r, f1, f2);
        return r;
    }

    add(a: Fp2): Fp2 {
        return new Fp2(this.x.add(a.x), this.y.add(a.y));
    }

    // See "Multiplication and Squaring in Pairing-Friendly Fields",
    // http://eprint.iacr.org/2006/471.pdf
    mul(a: Fp | Fp2): Fp2 {
        if (a instanceof Fp) {
            return new Fp2(
                this.x.mul(a),
                this.y.mul(a))
        }
        let tx = this.x.mul(a.y);
        let t = a.x.mul(this.y);
        tx = tx.add(t);

        let ty = this.y.mul(a.y);
        t = this.x.mul(a.x);
        ty = ty.sub(t);

        return new Fp2(tx, ty);
    }

    // See "Implementing cryptographic pairings", M. Scott, section 3.2.
    // ftp://136.206.11.249/pub/crypto/pairings.pdf
    inv(): Fp2 {
        let t = this.y.mul(this.y);
        let t2 = this.x.mul(this.x);
        t = t.add(t2);
        const inv = Fp.one().div(t);
        return new Fp2(this.x.neg().mul(inv), this.y.mul(inv));
    }

    sub(a: Fp2): Fp2 {
        return new Fp2(this.x.sub(a.x), this.y.sub(a.y));
    }

    div(a: Fp2): Fp2 {
        return this.mul(a.inv());
    }

    if(flag: Register, other: Fp2): Fp2 {
        return new Fp2(
            this.x.if(flag, other.x),
            this.y.if(flag, other.y));
    }

    ifBit(r: Register, bit: number, other: Fp2): Fp2 {
        return new Fp2(
            this.x.ifBit(r, bit, other.x),
            this.y.ifBit(r, bit, other.y));
    }

    neg(): Fp2 {
        return this.zero().sub(this);
    }

    conj(): Fp2 {
        return new Fp2(this.x.neg(), this.y);
    }

    toString(): string {
        return `[${this.x.toString()}, ${this.y.toString()}]`;
    }

    // MulXi returns ξthis where ξ=i+9
    mulXi(): Fp2 {
        // (xi+y)(i+3) = (9x+y)i+(9y-x)
        let tx = this.x.mul(_2__3).add(this.x).add(this.y);
        let ty = this.y.mul(_2__3).add(this.y).sub(this.x);
        return new Fp2(tx, ty);
    }

    assertZero() {
        vm.assertEqZero(this.x.register);
        vm.assertEqZero(this.y.register);
    }

    assertOne() {
        vm.assertEqZero(this.x.register);
        vm.assertEqOne(this.y.register);
    }
}
