import { prime_bigint } from "../vm/prime";
import { vm } from "../vm/vm";
import { EC, ECPoint } from "./ec";
import { Fp } from "./fp";
import { Fp12 } from "./fp12";
import { G1Point } from "./G1";
import { G2, G2Point } from "./G2";
import { Poly12 } from "./poly12";

const ateLoopCount = 29793968203157093288n;
const log_ate_loop_count = 63n;
export const curveOrder = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const prime_pow_degree_sub_one_div_order = (prime_bigint ** 12n - 1n) / curveOrder;

export class G3Point extends ECPoint<Fp12> {
}

// group over elliptic curve over polynomial field over finite field
export class G3 extends EC<Fp12> {

    fiveZeros: Fp[];
    nine: Fp;
    initialW: Fp12;

    constructor() {
        const ec_a = Fp12.zero();
        const ec_b = Fp12.hardcoded([3n]);
        super(ec_a, ec_b);
        this.fiveZeros = [0, 0, 0, 0, 0].map(() => Fp.hardcoded(0n));
        this.nine = Fp.hardcoded(9n);
        this.initialW = Fp12.hardcoded([0n, 1n]);
    }

    makePoint(x: Fp12, y: Fp12): G3Point {
        return new G3Point(this, x, y);
    }

    getGenerator(g2: G2): ECPoint<Fp12> {
        return this.twist(g2.generator);
    }

    twist(pt: G2Point): G3Point {
        const w = this.initialW;
        const w_2 = w.mul(w);
        const w_3 = w_2.mul(w);
        const x = pt.x;
        const y = pt.y;
        const xcoeffs = [
            x.r.sub(x.i.mul(this.nine)),
            x.i];
        const ycoeffs = [
            y.r.sub(y.i.mul(this.nine)),
            y.i];
        const nx = new Fp12(new Poly12(
            [xcoeffs[0],
            ...this.fiveZeros,
            xcoeffs[1],
            ...this.fiveZeros]));
        const ny = new Fp12(new Poly12(
            [ycoeffs[0],
            ...this.fiveZeros,
            ycoeffs[1],
            ...this.fiveZeros]));

        const result = this.makePoint(w_2.mul(nx), w_3.mul(ny));
        return result;
    }

    cast(p: G1Point): G3Point {
        return this.makePoint(
            new Fp12(new Poly12([p.x])),
            new Fp12(new Poly12([p.y]))
        );
    }

    miller(q: G3Point, p: G3Point): Fp12 {
        let f = Fp12.one();
        let r = q;

        for (let i = log_ate_loop_count; i >= 0n; i--) {
            f = f.mul(f).mul(r.line(r, p));
            r = r.double();
            if (ateLoopCount & 2n ** i) {
                f = f.mul(r.line(q, p));
                r = r.add(q);
            }
        }

        const q_x_pow_prime = q.x.powHardcoded(prime_bigint);
        const q_y_pow_prime = q.y.powHardcoded(prime_bigint);

        const q1 = this.makePoint(
            q_x_pow_prime,
            q_y_pow_prime);
        // q1.assertPoint();

        f = f.mul(r.line(q1, p));
        r = r.add(q1);

        const q1_x_pow_prime = q1.x.powHardcoded(prime_bigint);
        const q1_y_pow_prime = q1.y.powHardcoded(prime_bigint);

        const nq2 = this.makePoint(
            q1_x_pow_prime,
            q1_y_pow_prime.neg());
        // nq2.assertPoint();

        f = f.mul(r.line(nq2, p));
        f = f.powHardcoded(prime_pow_degree_sub_one_div_order);
        return f;
    }

    pairing(p: G1Point, q: G2Point): Fp12 {
        //vm.gcEnter();
        const r = this.miller(this.twist(q), this.cast(p));
        //vm.gcExit(r.getRegisters());
        return r;
    }
}
