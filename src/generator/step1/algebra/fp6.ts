import { step1_vm as vm } from "../vm/vm";
import { Register } from "../../common/register";
import { Fp2 } from "./fp2";
import { Fp } from "./fp";

// xiTo2PMinus2Over3 is ξ^((2p-2)/3) where ξ = i+9.
const xiTo2PMinus2Over3 = Fp2.hardcoded(
    19937756971775647987995932169929341994314640652964949448313374472400716661030n,
    2581911344467009335267311115468803099551665605076196740867805258568234346338n);

// xiToPMinus1Over3 is ξ^((p-1)/3) where ξ = i+9.
const xiToPMinus1Over3 = Fp2.hardcoded(
    10307601595873709700152284273816112264069230130616436755625194854815875713954n,
    21575463638280843010398324269430826099269044274347216827212613867836435027261n);

// xiTo2PSquaredMinus2Over3 is ξ^((2p²-2)/3) where ξ = i+9 (a cubic root of unity, mod p).
const xiTo2PSquaredMinus2Over3 = Fp.hardcoded(2203960485148121921418603742825762020974279258880205651966n);

// xiToPSquaredMinus1Over3 is ξ^((p²-1)/3) where ξ = i+9.
const xiToPSquaredMinus1Over3 = Fp.hardcoded(21888242871839275220042445260109153167277707414472061641714758635765020556616n);

export class Fp6 {

    x: Fp2;
    y: Fp2;
    z: Fp2;

    constructor(x?: Fp2, y?: Fp2, z?: Fp2) {
        this.x = x ? x : Fp2.zero();
        this.y = y ? y : Fp2.zero();
        this.z = z ? z : Fp2.zero();
    }

    getRegisters(): Register[] {
        return [...this.x.getRegisters(), ...this.y.getRegisters(), ...this.z.getRegisters()];
    }

    zero(): Fp6 {
        return new Fp6();
    }

    one(): Fp6 {
        return new Fp6(Fp2.zero(), Fp2.zero(), Fp2.one());
    }

    static zero(): Fp6 {
        return new Fp6();
    }

    static one(): Fp6 {
        return new Fp6(Fp2.zero(), Fp2.zero(), Fp2.one());
    }

    eq(a: Fp6): Register {
        const f1 = this.x.eq(a.x);
        const f2 = this.y.eq(a.y);
        const f3 = this.z.eq(a.z);
        const r = vm.newRegister();
        vm.and(r, f1, f2);
        vm.and(r, r, f3);
        return r;
    }

    add(a: Fp6): Fp6 {
        return new Fp6(this.x.add(a.x), this.y.add(a.y), this.z.add(a.z));
    }

    sub(a: Fp6): Fp6 {
        return new Fp6(this.x.sub(a.x), this.y.sub(a.y), this.z.sub(a.z));
    }

    // "Multiplication and Squaring on Pairing-Friendly Fields"
    // Section 4, Karatsuba method.
    // http://eprint.iacr.org/2006/471.pdf
    mul(a: Fp | Fp2 | Fp6): Fp6 {

        if (a instanceof Fp || a instanceof Fp2) {
            return new Fp6(this.x.mul(a), this.y.mul(a), this.z.mul(a));
        }

        let v0 = this.z.mul(a.z);
        let v1 = this.y.mul(a.y);
        let v2 = this.x.mul(a.x);

        let t0 = this.x.add(this.y);
        let t1 = a.x.add(a.y);
        let tz = t0.mul(t1);

        tz = tz.sub(v1).sub(v2);
        tz = tz.mulXi().add(v0);

        t0 = this.y.add(this.z);
        t1 = a.y.add(a.z);

        let ty = t0.mul(t1).sub(v0).sub(v1);
        t0 = v2.mulXi();
        ty = ty.add(t0);

        t0 = this.x.add(this.z);
        t1 = a.x.add(a.z);
        let tx = t0.mul(t1).sub(v0).add(v1).sub(v2);

        return new Fp6(tx, ty, tz);
    }

    // MulTau computes τ·(aτ²+bτ+c) = bτ²+cτ+aξ
    mulTau(): Fp6 {
        let tz = this.x.mulXi();
        return new Fp6(this.y, this.z, tz);
    }

    // See "Implementing cryptographic pairings", M. Scott, section 3.2.
    // ftp://136.206.11.249/pub/crypto/pairings.pdf
    // Here we can give a short explanation of how it works: let j be a cubic root of
    // unity in GF(p²) so that 1+j+j²=0.
    // Then (xτ² + yτ + z)(xj²τ² + yjτ + z)(xjτ² + yj²τ + z)
    // = (xτ² + yτ + z)(Cτ²+Bτ+A)
    // = (x³ξ²+y³ξ+z³-3ξxyz) = F is an element of the base field (the norm).
    //
    // On the other hand (xj²τ² + yjτ + z)(xjτ² + yj²τ + z)
    // = τ²(y²-ξxz) + τ(ξx²-yz) + (z²-ξxy)
    //
    // So that's why A = (z²-ξxy), B = (ξx²-yz), C = (y²-ξxz)
    inv(): Fp6 {
        let A = this.z.mul(this.z);
        let t1 = this.x.mul(this.y).mulXi();
        A = A.sub(t1);

        let B = this.x.mul(this.x).mulXi();
        t1 = this.y.mul(this.z);
        B = B.sub(t1);

        let C_ = this.y.mul(this.y);
        t1 = this.x.mul(this.z);
        C_ = C_.sub(t1);

        let F = C_.mul(this.y).mulXi();
        t1 = A.mul(this.z);
        F = F.add(t1);
        t1 = B.mul(this.x).mulXi();
        F = F.add(t1);

        return new Fp6(C_.div(F), B.div(F), A.div(F));
    }

    div(a: Fp6): Fp6 {
        return this.mul(a.inv());
    }

    if(flag: Register, other: Fp6): Fp6 {
        return new Fp6(
            this.x.if(flag, other.x),
            this.y.if(flag, other.y),
            this.z.if(flag, other.z));
    }

    ifBit(r: Register, bit: number, other: Fp6): Fp6 {
        return new Fp6(
            this.x.ifBit(r, bit, other.x),
            this.y.ifBit(r, bit, other.y),
            this.z.ifBit(r, bit, other.z));
    }

    neg(): Fp6 {
        return this.zero().sub(this);
    }

    frobenius(): Fp6 {
        const r = this.zero();
        r.x = this.x.conj();
        r.x = r.x.mul(xiTo2PMinus2Over3);
        r.y = this.y.conj();
        r.y = r.y.mul(xiToPMinus1Over3);
        r.z = this.z.conj();
        return r;
    }

    // FrobeniusP2 computes (xτ²+yτ+z)^(p²) = xτ^(2p²) + yτ^(p²) + z
    frobeniusP2(): Fp6 {
        const r = this.zero();
        // τ^(2p²) = τ²τ^(2p²-2) = τ²ξ^((2p²-2)/3)
        r.x = this.x.mul(xiTo2PSquaredMinus2Over3);
        // τ^(p²) = ττ^(p²-1) = τξ^((p²-1)/3)
        r.y = this.y.mul(xiToPSquaredMinus1Over3);
        r.z = this.z;
        return r;
    }

    assertZero() {
        this.x.assertZero();
        this.y.assertZero();
        this.z.assertZero();
    }

    assertOne() {
        this.x.assertZero();
        this.y.assertZero();
        this.z.assertOne();
    }
    
    toString(): string {

        return `[${this.x.toString()}, ${this.y.toString()}, ${this.z.toString()}]`;
    }
}
