import fs from 'fs';

import { Fp } from "./algebra/fp";
import { Fp2 } from "./algebra/fp2";
import { G1, G1Point } from "./algebra/G1";
import { G2, G2Point } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { vm } from "./vm/vm";
import { prime_bigint } from './vm/prime';

const g1 = new G1();
const g2 = new G2();
const g3 = new G3();

const mont_r2 = 6350874878119819312338956282401532409788428879151445726012394534686998597021n;

function toMongomery(n: bigint): bigint {
    return (n * mont_r2) % prime_bigint;
}

export class Proof {
    pi_a: G1Point;
    pi_b: G2Point;
    pi_c: G1Point;
    publicSignals: Fp[] = [];

    constructor(_witness: bigint[]) {
        let i = 0;
        const witness = _witness.map(n => vm.hardcode(n));
        this.pi_a = g1.makePoint(new Fp(witness[i++]), new Fp(witness[i++]));
        this.pi_b = g2.makePoint(new Fp2(new Fp(witness[i++]), new Fp(witness[i++])), new Fp2(new Fp(witness[i++]), new Fp(witness[i++])));
        this.pi_c = g1.makePoint(new Fp(witness[i++]), new Fp(witness[i++]));

        while (i < witness.length) {
            this.publicSignals.push(new Fp(witness[i++]));
        }
    }

    static fromSnarkjs(snarkjsProof: any, publicSignals: string[]) {
        let t = [
            snarkjsProof.pi_a[0], snarkjsProof.pi_a[1],
            snarkjsProof.pi_b[0][1], snarkjsProof.pi_b[0][0], snarkjsProof.pi_b[1][1], snarkjsProof.pi_b[1][0],
            snarkjsProof.pi_c[0], snarkjsProof.pi_c[1],
        ];
        t = t.map(s => BigInt(s));
        return new Proof([...t, ...publicSignals.map(s => BigInt(s))]);
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

    private constructor(a: G1Point, b: G2Point, c: G2Point, d: G2Point, ic: G1Point[]) {
        this.alpha = a;
        this.beta = b;
        this.gamma = c;
        this.delta = d;
        this.ic = ic;
    }
    
    static fromSnarkjs(obj: any) {
        if (obj.protocol != 'groth16' || obj.curve != 'bn128') throw new Error('Invalid key file');

        function toFp(s: string): Fp {
            return Fp.hardcoded(BigInt(s));
        }
        function toFp2(sa: string[]): Fp2 {
            return Fp2.hardcoded(BigInt(sa[1]), BigInt(sa[0]));
        }

        const alpha = g1.makePoint(toFp(obj.vk_alpha_1[0]), toFp(obj.vk_alpha_1[1]));
        const beta = g2.makePoint(toFp2(obj.vk_beta_2[0]), toFp2(obj.vk_beta_2[1]));
        const gamma = g2.makePoint(toFp2(obj.vk_gamma_2[0]), toFp2(obj.vk_gamma_2[1]));
        const delta = g2.makePoint(toFp2(obj.vk_delta_2[0]), toFp2(obj.vk_delta_2[1]));

        const ic: G1Point[] = [];
        for (let i = 0; i < obj.IC.length; i++) {
            ic[i] = g1.makePoint(toFp(obj.IC[i][0]), toFp(obj.IC[i][1]));
        }
        return new Key(
            alpha,
            beta,
            gamma,
            delta,
            ic
        );
    }
}

export default async function groth16Verify(key: Key, proof: Proof) {
    let vk_x = g1.makePoint(key.ic[0].x, key.ic[0].y)

    for (let i = 0; i < proof.publicSignals.length; i++) {
        let t = key.ic[i + 1].mul(proof.publicSignals[i].getRegister());
        vk_x = vk_x.add(t);
    }

    vk_x.assertPoint();
    proof.validate();

    let vg1: G1Point[] = [proof.pi_a, key.alpha.neg(), vk_x.neg(), proof.pi_c.neg()]
    let vg2: G2Point[] = [proof.pi_b, key.beta, key.gamma, key.delta]
    return g3.pairingCheck(vg1, vg2)
}
