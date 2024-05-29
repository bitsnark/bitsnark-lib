import fs from 'fs';

import { Fp } from "./algebra/fp";
import { Fp2 } from "./algebra/fp2";
import { G1, G1Point } from "./algebra/G1";
import { G2, G2Point } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { vm } from "./vm/vm";

const fp0 = Fp.hardcoded(0n);

const g1 = new G1();
const g2 = new G2();
const g3 = new G3();

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
            snarkjsProof.pi_b[0][0], snarkjsProof.pi_b[0][1], snarkjsProof.pi_b[1][0], snarkjsProof.pi_b[1][1],
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

    constructor(obj: any) {
        if (obj.protocol != 'groth16' || obj.curve != 'bn128') throw new Error('Invalid key file');

        this.alpha = g1.makePoint(Fp.hardcoded(BigInt(obj.vk_alpha_1[0])), Fp.hardcoded(BigInt(obj.vk_alpha_1[1])));
        this.beta = g2.makePoint(
            Fp2.hardcoded(BigInt(obj.vk_beta_2[0][0]), BigInt(obj.vk_beta_2[0][1])),
            Fp2.hardcoded(BigInt(obj.vk_beta_2[1][0]), BigInt(obj.vk_beta_2[1][1])));
        this.gamma = g2.makePoint(
            Fp2.hardcoded(BigInt(obj.vk_gamma_2[0][0]), BigInt(obj.vk_gamma_2[0][1])),
            Fp2.hardcoded(BigInt(obj.vk_gamma_2[1][0]), BigInt(obj.vk_gamma_2[1][1])));
        this.delta = g2.makePoint(
            Fp2.hardcoded(BigInt(obj.vk_delta_2[0][0]), BigInt(obj.vk_delta_2[0][1])),
            Fp2.hardcoded(BigInt(obj.vk_delta_2[1][0]), BigInt(obj.vk_delta_2[1][1])));
        for (let i = 0; i < obj.IC.length; i++) {
            this.ic[i] = g1.makePoint(Fp.hardcoded(BigInt(obj.IC[i][0])), Fp.hardcoded(BigInt(obj.IC[i][1])));
        }
    }

    static async fromFile(path: string): Promise<Key> {
        return new Promise((accept, reject) => {
            fs.readFile(path, 'utf-8', (err, data) => {
                if (err) reject(err);
                else accept(JSON.parse(data));
            });
        }).then(obj => {
            const k = new Key(obj);
            return k;
        });
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

    const pr = g3.pairing(proof.pi_a, proof.pi_b);
    const p1 = g3.pairing(key.alpha, key.beta);
    const p2 = g3.pairing(vk_x, key.gamma);
    const p3 = g3.pairing(proof.pi_c, key.delta);
    const tpr = p1.add(p2).add(p3);

    const f = tpr.eq(pr);
    vm.assertEqOne(f);
}

async function generate() {

    const key = await Key.fromFile('./tests/groth16/verification_key.json');
    groth16Verify(key, new Proof([0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]));

    vm.optimizeRegs();
    const obj = vm.save();
    fs.writeFile('./generated/step1.json', JSON.stringify(obj, null, '\t'), 'utf8', err => {
        console.error(err);
    });
}
