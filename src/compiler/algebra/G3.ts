import { EC, ECPoint } from "./ec";
import { ExtensionField, ExtensionMember } from "./extension";
import { Polynomial, PolynomialOverPrimeField } from "./polynomial";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { G2Point } from "./G2";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";
import { Complex } from "./complex";
import { g1, G1, G1Point } from "./G1";

const rAteLoopCount = vm.hardcoded(29793968203157093288n);
const log_ate_loop_count = 63;
const curveOrder = vm.hardcoded(21888242871839275222246405745257275088548364400416034343698204186575808495617n);

const zero = new PrimeFieldMember(vm.hardcoded(0n));
const one = new PrimeFieldMember(vm.hardcoded(1n));
const nine = new PrimeFieldMember(vm.hardcoded(9n));
const degree = vm.hardcoded(12n);
const prime: Register = vm.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);
const polyField = new PolynomialOverPrimeField(primeField, Number(degree.getValue()));
const base = polyField.newMember(
    [82n, 0n, 0n, 0n, 0n, 0n, -18n, 0n, 0n, 0n, 0n, 0n]
        .map(c => primeField.newMember(vm.hardcoded(c))));

const extField = new ExtensionField(base);
const w = extField.newMember(
    polyField.newMember(
        [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(n => primeField.newMember(vm.hardcoded(n)))));
const w_2 = w.mul(w) as ExtensionMember;
const w_3 = w_2.mul(w) as ExtensionMember;

const fiveZeros = [0, 0, 0, 0, 0].map(() => primeField.newMember(vm.R_0));

const ec_a = extField.newMember();
const ec_b = extField.newMember(
    polyField.newMember(
        [3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(c => primeField.newMember(vm.hardcoded(c)))));

export class G3Point extends ECPoint {
}

// group over elliptic curve over polynomial field over finite field
export class G3 extends EC {

    constructor() {
        super(ec_a, ec_b);
    }

    makePoint(x: ExtensionMember, y: ExtensionMember): G3Point {
        return new G3Point(this, x, y);
    }

    twist(pt: G2Point): G3Point {
        const x = pt.x as Complex;
        const y = pt.y as Complex;
        const xcoeffs = [
            x.r.sub(x.i.mul(nine)) as PrimeFieldMember,
            x.i];
        const ycoeffs = [
            y.r.sub(y.i.mul(nine)) as PrimeFieldMember,
            y.i];
        const nx = extField.newMember(
            polyField.newMember(
                [xcoeffs[0],
                ...fiveZeros,
                xcoeffs[1],
                ...fiveZeros]));
        const ny = extField.newMember(
            polyField.newMember(
                [ycoeffs[0],
                ...fiveZeros,
                ycoeffs[1],
                ...fiveZeros]));

        return this.makePoint(w_2.mul(nx) as ExtensionMember, w_3.mul(ny) as ExtensionMember);
    }

    miller(q: G1Point, p: G1Point): Polynomial {
        let r = q;
        let f = base.one();

        for (let i = log_ate_loop_count; i >= 0; i--) {
            f = f.mul(f).mul(G1.line(r, r, p)) as Polynomial;
            r = r.double();
            if (BigInt(2 ** i) & rAteLoopCount.getValue()) {
                f = f.mul(G1.line(r, q, p)) as Polynomial;
                r = r.add(q);
            }
        }

        const tr = q.mul(rAteLoopCount)
        const tf = r.eq(tr);
        vm.assertEqOne(tf);

        const q1 = g1.makePoint(
            q.x.pow(primeField.getPrime()) as PrimeFieldMember, 
            q.y.pow(primeField.getPrime()) as PrimeFieldMember);
        q1.assertPoint();
        
        const nq2 = g1.makePoint(
            q.x.pow(primeField.getPrime()) as PrimeFieldMember, 
            q.y.pow(primeField.getPrime()).neg() as PrimeFieldMember);
        nq2.assertPoint();

        f = f.mul(G1.line(r, q1, p)) as Polynomial;
        r = r.add(q1);
        f = f.mul(G1.line(r, nq2, p)) as Polynomial;
        f.pow(primeField.getPrime().pow(primeField.newMember(degree)).sub(one).div(primeField.newMember(curveOrder)));

        return f;
    }

    cast(p: G1Point): G3Point {
        return g3.makePoint(
            new ExtensionMember(base, new Polynomial(primeField, Number(degree.getValue()), [
                p.x as PrimeFieldMember, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, 
            ])),
            new ExtensionMember(base, new Polynomial(primeField, Number(degree.getValue()), [
                p.y as PrimeFieldMember, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, 
            ])),
        );
    }

    pairing(q: G2Point, p: G1Point): Polynomial {
        q.assertPoint();
        p.assertPoint();
        return this.miller(this.twist(q), this.cast(p));
    }
}

export const g3 = new G3();
