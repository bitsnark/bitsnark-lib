import { step1_vm as vm } from "../vm/vm";
import { EC, ECPoint } from "./ec";
import { Fp } from "./fp";
import { Fp12t } from "./fp12t";
import { Fp2 } from "./fp2";
import { Fp6 } from "./fp6";
import { G1Point } from "./G1";
import { G2Point } from "./G2";

export const curveOrder = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const u = 4965661367192848881n;
const sixuPlus2NAF = [
    0, 0, 0, 1, 0, 1, 0, -1, 0, 0, 1, -1, 0, 0, 1, 0,
    0, 1, 1, 0, -1, 0, 0, 1, 0, -1, 0, 0, 0, 0, 1, 1,
    1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 1,
    1, 0, 0, -1, 0, 0, 0, 1, 1, 0, -1, 0, 0, 1, 0, 1, 1];

// xiToPMinus1Over3 is ξ^((p-1)/3) where ξ = i+9.
const xiToPMinus1Over3 = Fp2.hardcoded(
    10307601595873709700152284273816112264069230130616436755625194854815875713954n,
    21575463638280843010398324269430826099269044274347216827212613867836435027261n);

// xiToPMinus1Over2 is ξ^((p-1)/2) where ξ = i+9.
const xiToPMinus1Over2 = Fp2.hardcoded(
    3505843767911556378687030309984248845540243509899259641013678093033130930403n,
    2821565182194536844548159561693502659359617185244120367078079554186484126554n);

// xiToPSquaredMinus1Over3 is ξ^((p²-1)/3) where ξ = i+9.
const xiToPSquaredMinus1Over3 = Fp.hardcoded(
    21888242871839275220042445260109153167277707414472061641714758635765020556616n);

export class G3Point extends ECPoint<Fp12t> {
}

// group over elliptic curve over polynomial field over finite field
export class G3 extends EC<Fp12t> {

    fiveZeros: Fp[];
    nine: Fp;

    constructor() {
        const ec_a = Fp12t.zero();
        const ec_b = new Fp12t(Fp6.zero(), new Fp6(Fp2.zero(), Fp2.zero(), new Fp2(Fp.hardcoded(3n), Fp.zero()))); // 3
        super(ec_a, ec_b);
        this.fiveZeros = [0, 0, 0, 0, 0].map(() => Fp.hardcoded(0n));
        this.nine = Fp.hardcoded(9n);
    }

    makePoint(x: Fp12t, y: Fp12t, z?: Fp12t, t?: Fp12t): G3Point {
        return new G3Point(this, x, y, z, t);
    }

    // twist(pt: G2Point): G3Point {
    //     const w = this.initialW;
    //     const w_2 = w.mul(w);
    //     const w_3 = w_2.mul(w);
    //     const x = pt.x;
    //     const y = pt.y;
    //     const xcoeffs = [
    //         x.r.sub(x.i.mul(this.nine)),
    //         x.i];
    //     const ycoeffs = [
    //         y.r.sub(y.i.mul(this.nine)),
    //         y.i];
    //     const nx = new Fp12(new Poly12(
    //         [xcoeffs[0],
    //         ...this.fiveZeros,
    //         xcoeffs[1],
    //         ...this.fiveZeros]));
    //     const ny = new Fp12(new Poly12(
    //         [ycoeffs[0],
    //         ...this.fiveZeros,
    //         ycoeffs[1],
    //         ...this.fiveZeros]));

    //     const result = this.makePoint(w_2.mul(nx), w_3.mul(ny));
    //     return result;
    // }

    // cast(p: G1Point): G3Point {
    //     return this.makePoint(
    //         new Fp12t(new Poly12t([p.x])),
    //         new Fp12t(new Poly12t([p.y]))
    //     );
    // }

    // See the mixed addition algorithm from "Faster Computation of the
    // Tate Pairing", http://arxiv.org/pdf/0904.0854v3.pdf
    static lineFunctionAdd(r: G2Point, p: G2Point, q: G1Point, r2: Fp2): { a: Fp2, b: Fp2, c: Fp2, rOut: G2Point } {

        let B = p.x.mul(r.t);
        let D = p.y.add(r.z);
        D = D.mul(D);
        D = D.sub(r2);
        D = D.sub(r.t);
        D = D.mul(r.t);

        let H = B.sub(r.x);
        let I = H.mul(H);

        let E = I.add(I);
        E = E.add(E);

        let J = H.mul(E);
        let L1 = D.sub(r.y);
        L1 = L1.sub(r.y);

        let V = r.x.mul(E);

        const rOut = r.curve.makePoint();
        rOut.x = L1.mul(L1);
        rOut.x = rOut.x.sub(J).sub(V).sub(V);
        rOut.z = r.z.add(H);
        rOut.z = rOut.z.mul(rOut.z);
        rOut.z = rOut.z.sub(r.t);
        rOut.z = rOut.z.sub(I);

        let t = V.sub(rOut.x);
        t = t.mul(L1);
        let t2 = r.y.mul(J);
        t2 = t2.add(t2);
        rOut.y = t.sub(t2);

        rOut.t = rOut.z.mul(rOut.z);

        t = p.y.add(rOut.z);
        t = t.mul(t);
        t = t.sub(r2);
        t = t.sub(rOut.t);

        t2 = L1.mul(p.x);
        t2 = t2.add(t2);
        let a = t2.sub(t);

        let c = rOut.z.mul(q.y);
        c = c.add(c);

        let b = L1.zero().sub(L1);
        b = b.mul(q.x);
        b = b.add(b);

        return { a, b, c, rOut };
    }

    // See the doubling algorithm for a=0 from "Faster Computation of the
    // Tate Pairing", http://arxiv.org/pdf/0904.0854v3.pdf
    static lineFunctionDouble(r: G2Point, q: G1Point): { a: Fp2, b: Fp2, c: Fp2, rOut: G2Point } {
        let a, b, c;
        let rOut: G2Point = new G2Point(r.curve);

        const A = r.x.mul(r.x);
        const B = r.y.mul(r.y);
        const C = B.mul(B);
        let D = r.x.add(B);
        D = D.mul(D);
        D = D.sub(A);
        D = D.sub(C);
        D = D.add(D);
        const E = A.add(A).add(A);
        const G = E.mul(E);
        rOut.x = G.sub(D).sub(D);
        rOut.z = r.y.add(r.z);
        rOut.z = rOut.z.mul(rOut.z).sub(B).sub(r.t);
        rOut.y = D.sub(rOut.x).mul(E);
        let t = C.add(C);
        t = t.add(t).add(t).add(t);
        rOut.y = rOut.y.sub(t);
        rOut.t = rOut.z.mul(rOut.z);

        t = E.mul(r.t);
        t = t.add(t);

        b = t.neg().mul(q.x);
        a = r.x.add(E);
        a = a.mul(a).sub(A).sub(G);
        t = B.add(B);
        t = t.add(t);
        a = a.sub(t);
        c = rOut.z.mul(r.t);
        c = c.add(c).mul(q.y);

        return { a, b, c, rOut };
    }

    static mulLine(ret: Fp12t, a: Fp2, b: Fp2, c: Fp2): Fp12t {
        let a2 = new Fp6(Fp2.zero(), a, b).mul(ret.x);
        let t3 = ret.y.mul(c);
        let t = b.add(c);
        let t2 = new Fp6(Fp2.zero(), a, t);
        ret.x = ret.x.add(ret.y);
        ret.y = t3;
        ret.x = ret.x.mul(t2);
        ret.x = ret.x.sub(a2);
        ret.x = ret.x.sub(ret.y);
        ret.y = ret.y.add(a2.mulTau());
        return ret;
    }

    miller(q: G2Point, p: G1Point): Fp12t {

        let ret = Fp12t.one();
        let aAffine = q.toAffine();
        let bAffine = p.toAffine();
        let minusA = aAffine.neg();
        let r = aAffine;
        let r2 = aAffine.y.mul(aAffine.y);

        for (let i = sixuPlus2NAF.length - 1; i > 0; i--) {
            let { a, b, c, rOut } = G3.lineFunctionDouble(r, bAffine);
            if (i != sixuPlus2NAF.length - 1) {
                ret = ret.mul(ret);
            }

            G3.mulLine(ret, a, b, c);
            r = rOut;

            if (sixuPlus2NAF[i - 1] == 1) {
                ({ a, b, c, rOut } = G3.lineFunctionAdd(r, aAffine, bAffine, r2));
            } else if (sixuPlus2NAF[i - 1] == -1) {
                ({ a, b, c, rOut } = G3.lineFunctionAdd(r, minusA, bAffine, r2));
            } else {
                continue;
            }

            G3.mulLine(ret, a, b, c);
            r = rOut;
        }

        // In order to calculate Q1 we have to convert q from the sextic twist
        // to the full GF(p^12) group, apply the Frobenius there, and convert
        // back.
        //
        // The twist isomorphism is (x', y') -> (xω², yω³). If we consider just
        // x for a moment, then after applying the Frobenius, we have x̄ω^(2p)
        // where x̄ is the conjugate of x. If we are going to apply the inverse
        // isomorphism we need a value with a single coefficient of ω² so we
        // rewrite this as x̄ω^(2p-2)ω². ξ⁶ = ω and, due to the construction of
        // p, 2p-2 is a multiple of six. Therefore we can rewrite as
        // x̄ξ^((p-1)/3)ω² and applying the inverse isomorphism eliminates the
        // ω².
        //
        // A similar argument can be made for the y value.

        let q1 = new G2Point(q.curve);
        q1.x = aAffine.x.conj();
        q1.x = q1.x.mul(xiToPMinus1Over3);
        q1.y = aAffine.y.conj();
        q1.y = q1.y.mul(xiToPMinus1Over2);
        q1.z = Fp2.one();
        q1.t = Fp2.one();

        // For Q2 we are applying the p² Frobenius. The two conjugations cancel
        // out and we are left only with the factors from the isomorphism. In
        // the case of x, we end up with a pure number which is why
        // xiToPSquaredMinus1Over3 is ∈ GF(p). With y we get a factor of -1. We
        // ignore this to end up with -Q2.

        let minusQ2 = new G2Point(q.curve);
        minusQ2.x = aAffine.x.mul(xiToPSquaredMinus1Over3);
        minusQ2.y = aAffine.y;
        minusQ2.z = Fp2.one();
        minusQ2.t = Fp2.one();

        r2 = q1.y.mul(q1.y);
        let { a, b, c, rOut } = G3.lineFunctionAdd(r, q1, bAffine, r2);
        G3.mulLine(ret, a, b, c);
        r = rOut;

        r2 = minusQ2.y.mul(minusQ2.y);
        ({ a, b, c, rOut } = G3.lineFunctionAdd(r, minusQ2, bAffine, r2));
        G3.mulLine(ret, a, b, c);
        r = rOut

        return ret;
    }

    // finalExponentiation computes the (p¹²-1)/Order-th power of an element of
    // GF(p¹²) to obtain an element of GT (steps 13-15 of algorithm 1 from
    // http://cryptojedi.org/papers/dclxvi-20100714.pdf)
    finalExponentiation(_in: Fp12t): Fp12t {

        // This is the p^6-Frobenius
        let t1 = new Fp12t(_in.x.neg(), _in.y);

        const inv = _in.inv();
        t1 = t1.mul(inv);

        const t2 = t1.frobeniusP2();
        t1 = t1.mul(t2);

        const t1t = t1;

        const fu = t1.powHardcoded(u);
        const fu2 = fu.powHardcoded(u);
        const fu3 = fu2.powHardcoded(u);

        const fu3p = fu3.frobenius();
        const y6 = fu3.mul(fu3p).conj();

        let t0 = y6.mul(y6);

        const fu2p = fu2.frobenius();
        const y4 = fu.mul(fu2p).conj();

        t0 = t0.mul(y4);
        const y5 = fu2.conj();
        const y1 = t1.conj();
        const y3 = fu.frobenius().conj();

        t1 = y3.mul(y5);
        t0 = t0.mul(y5);
        t1 = t1.mul(t0);
        const y2 = fu2.frobeniusP2();
        t0 = t0.mul(y2);
        t1 = t1.mul(t1);
        t1 = t1.mul(t0);
        t1 = t1.mul(t1);
        t0 = t1.mul(y1);

        const fp2 = t1t.frobeniusP2();
        const fp3 = fp2.frobenius();
        const fp = t1t.frobenius();
        const y0 = fp.mul(fp2).mul(fp3);

        t1 = t1.mul(y0);
        t0 = t0.mul(t0);
        t0 = t0.mul(t1);

        return t0;
    }

    optimalAte(b: G1Point, a: G2Point): Fp12t {
        const e = this.miller(a, b);
        const ret = this.finalExponentiation(e);
        return ret;
    }

    pairingCheck(a: G1Point[], b: G2Point[]) {
        // let acc = new Fp12t();
        let acc = this.miller(b[0], a[0]);
        acc = acc.mul(this.miller(b[1], a[1]));
        acc = acc.mul(this.miller(b[2], a[2]));
        acc = acc.mul(this.miller(b[3], a[3]));
        const ret = this.finalExponentiation(acc);
        ret.assertOne();
    }
}
