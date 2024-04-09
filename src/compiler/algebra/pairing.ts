import { vm } from "../vm/vm";
import { Complex } from "./complex";
import { ExtensionMember } from "./extension";
import { G1Point, G1, g1 } from "./G1";
import { G2Point } from "./G2";
import { G3, G3Point, g3 } from "./G3";
import { Polynomial } from "./polynomial";
import { PrimeFieldMember } from "./prime-field";

const rAteLoopCount = vm.hardcoded(29793968203157093288n);
const log_ate_loop_count = 63;
const curveOrder = vm.hardcoded(21888242871839275222246405745257275088548364400416034343698204186575808495617n);

const w = G3.extField.newMember(
    G3.polyField.newMember(
        [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(n => G3.primeField.newMember(vm.hardcoded(n)))));
const w_2 = w.mul(w) as ExtensionMember;
const w_3 = w_2.mul(w) as ExtensionMember;

const fiveZeros = [0, 0, 0, 0, 0].map(() => G3.primeField.newMember(vm.R_0));

const degree = G3.primeField.newMember(vm.hardcoded(12n));

const zero = G3.primeField.newMember(vm.hardcoded(0n));
const one = G3.primeField.newMember(vm.hardcoded(1n));
const nine = G3.primeField.newMember(vm.hardcoded(9n));

export function twist(pt: G2Point): G3Point {
    const x = pt.x as Complex;
    const y = pt.y as Complex;
    const xcoeffs = [
        x.r.sub(x.i.mul(nine)) as PrimeFieldMember,
        x.i];
    const ycoeffs = [
        y.r.sub(y.i.mul(nine)) as PrimeFieldMember,
        y.i];
    const nx = G3.extField.newMember(
        G3.polyField.newMember(
            [xcoeffs[0],
            ...fiveZeros,
            xcoeffs[1],
            ...fiveZeros]));
    const ny = G3.extField.newMember(
        G3.polyField.newMember(
            [ycoeffs[0],
            ...fiveZeros,
            ycoeffs[1],
            ...fiveZeros]));

    return g3.makePoint(w_2.mul(nx) as ExtensionMember, w_3.mul(ny) as ExtensionMember);
}

export function miller(q: G1Point, p: G1Point): Polynomial {
    let r = q;
    let f = G3.extField.polymod.one();

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
        q.x.pow(G3.primeField.getPrime()) as PrimeFieldMember, 
        q.y.pow(G3.primeField.getPrime()) as PrimeFieldMember);
    q1.assertPoint();
    
    const nq2 = g1.makePoint(
        q.x.pow(G3.primeField.getPrime()) as PrimeFieldMember, 
        q.y.pow(G3.primeField.getPrime()).neg() as PrimeFieldMember);
    nq2.assertPoint();

    f = f.mul(G1.line(r, q1, p)) as Polynomial;
    r = r.add(q1);
    f = f.mul(G1.line(r, nq2, p)) as Polynomial;
    f.pow(G3.primeField.getPrime().pow(degree).sub(one).div(G3.primeField.newMember(curveOrder)));

    return f;
}

export function cast(p: G1Point): G3Point {
    return g3.makePoint(
        new ExtensionMember(G3.extField.polymod, new Polynomial(G3.primeField, 12, [
            p.x as PrimeFieldMember, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero
        ])),
        new ExtensionMember(G3.extField.polymod, new Polynomial(G3.primeField, 12, [
            p.y as PrimeFieldMember, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero, zero
        ]))
    );
}

export function pairing(q: G2Point, p: G1Point): Polynomial {
    q.assertPoint();
    p.assertPoint();
    return miller(twist(q), cast(p));
}
