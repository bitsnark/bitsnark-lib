import fs from 'fs';

import { Fp } from "./algebra/fp";
import { Fp2 } from "./algebra/fp2";
import { G1, G1Point } from "./algebra/G1";
import { G2, G2Point } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { vm } from "./vm/vm";
import { Register } from '../common/register';

const alpha_x = 0n;
const alpha_y = 0n;

const beta_x_r = 0n;
const beta_x_i = 0n;
const beta_y_r = 0n;
const beta_y_i = 0n;

const gamma_x_r = 0n;
const gamma_x_i = 0n;
const gamma_y_r = 0n;
const gamma_y_i = 0n;

const delta_x_r = 0n;
const delta_x_i = 0n;
const delta_y_r = 0n;
const delta_y_i = 0n;

const ic = [
    [0n, 0n],
    [0n, 0n],
    [0n, 0n],
    [0n, 0n],
    [0n, 0n],
    [0n, 0n],
    [0n, 0n]
];

const g1 = new G1();
const g2 = new G2();
const g3 = new G3();

export class Proof {
    pi_a: G1Point;
    pi_b: G2Point;
    pi_c: G1Point;

    constructor(_witness: bigint[]) {
        let i = 0;
        const witness = _witness.map(n => vm.hardcode(n));
        this.pi_a = g1.makePoint(new Fp(witness[i++]), new Fp(witness[i++]));
        this.pi_b = g2.makePoint(new Fp2(new Fp(witness[i++]), new Fp(witness[i++])), new Fp2(new Fp(witness[i++]), new Fp(witness[i++])));
        this.pi_c = g1.makePoint(new Fp(witness[i++]), new Fp(witness[i++]));
    }

    validate() {
        this.pi_a.assertPoint();
        this.pi_b.assertPoint();
        this.pi_c.assertPoint();
    }
}

export class Key {
    alpha: G1Point;
    beta: G2Point;
    gamma: G2Point;
    delta: G2Point;
    ic: G1Point[] = [];

    constructor() {
        let i = 0;
        this.alpha = g1.makePoint(Fp.hardcoded(alpha_x), Fp.hardcoded(alpha_y));
        this.beta = g2.makePoint(new Fp2(Fp.hardcoded(beta_x_r), Fp.hardcoded(beta_x_i)), new Fp2(Fp.hardcoded(beta_y_r), Fp.hardcoded(beta_y_i)));
        this.gamma = g2.makePoint(new Fp2(Fp.hardcoded(gamma_x_r), Fp.hardcoded(gamma_x_i)), new Fp2(Fp.hardcoded(gamma_y_r), Fp.hardcoded(gamma_y_i)));
        this.delta = g2.makePoint(new Fp2(Fp.hardcoded(delta_x_r), Fp.hardcoded(delta_x_i)), new Fp2(Fp.hardcoded(delta_y_r), Fp.hardcoded(delta_y_i)));
        for (let i = 0; i < ic.length; i++) {
            this.ic[i] = g1.makePoint(Fp.hardcoded(ic[i][0]), Fp.hardcoded(ic[i][1]));
        }
    }
}

const key = new Key();

export default async function groth16Verify(publicSignals: bigint[], proof: Proof) {

    proof.validate();

    const fp0 = Fp.hardcoded(0n);
    let vk_x = g1.makePoint(fp0, fp0)

    for (let i = 0; i < publicSignals.length; i++) {
        let t = key.ic[i + 1].mul(vm.addWitness(publicSignals[i]));
        vk_x = t.add(vk_x);
    }

    const pr = g3.pairing(proof.pi_b, proof.pi_a);
    const p1 = g3.pairing(key.beta, key.alpha);
    const p2 = g3.pairing(key.gamma, vk_x);
    const p3 = g3.pairing(key.delta, proof.pi_c);
    const tpr = p1.add(p2).add(p3);

    const f = tpr.eq(pr);
    vm.assertEqOne(f);
}

groth16Verify([], new Proof([
    0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n,
]));

vm.optimizeRegs();
const obj = vm.save();
fs.writeFile('./generated/step1.json', JSON.stringify(obj, null, '\t'), 'utf8', err => {
    console.error(err);
});

