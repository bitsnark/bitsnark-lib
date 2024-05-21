import fs from 'fs';

import { Fp } from "./algebra/fp";
import { Fp2 } from "./algebra/fp2";
import { G1, G1Point } from "./algebra/G1";
import { G2, G2Point } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { vm } from "./vm/vm";

const alpha_x = 20692898189092739278193869274495556617788530808486270118371701516666252877969n;
const alpha_y = 11713062878292653967971378194351968039596396853904572879488166084231740557279n;

const beta_x_r = 12168528810181263706895252315640534818222943348193302139358377162645029937006n;
const beta_x_i = 281120578337195720357474965979947690431622127986816839208576358024608803542n;
const beta_y_r = 16129176515713072042442734839012966563817890688785805090011011570989315559913n;
const beta_y_i = 9011703453772030375124466642203641636825223906145908770308724549646909480510n;

const gamma_x_r = 11559732032986387107991004021392285783925812861821192530917403151452391805634n;
const gamma_x_i = 10857046999023057135944570762232829481370756359578518086990519993285655852781n;
const gamma_y_r = 4082367875863433681332203403145435568316851327593401208105741076214120093531n;
const gamma_y_i = 8495653923123431417604973247489272438418190587263600148770280649306958101930n;

const delta_x_r = 21280594949518992153305586783242820682644996932183186320680800072133486887432n;
const delta_x_i = 150879136433974552800030963899771162647715069685890547489132178314736470662n;
const delta_y_r = 1081836006956609894549771334721413187913047383331561601606260283167615953295n;
const delta_y_i = 11434086686358152335540554643130007307617078324975981257823476472104616196090n;

const ic = [
    [16225148364316337376768119297456868908427925829817748684139175309620217098814n, 5167268689450204162046084442581051565997733233062478317813755636162413164690n],
    [12882377842072682264979317445365303375159828272423495088911985689463022094260n, 19488215856665173565526758360510125932214252767275816329232454875804474844786n],
    [13083492661683431044045992285476184182144099829507350352128615182516530014777n, 602051281796153692392523702676782023472744522032670801091617246498551238913n],
    [9732465972180335629969421513785602934706096902316483580882842789662669212890n, 2776526698606888434074200384264824461688198384989521091253289776235602495678n],
    [8586364274534577154894611080234048648883781955345622578531233113180532234842n, 21276134929883121123323359450658320820075698490666870487450985603988214349407n],
    [4910628533171597675018724709631788948355422829499855033965018665300386637884n, 20532468890024084510431799098097081600480376127870299142189696620752500664302n],
    [15335858102289947642505450692012116222827233918185150176888641903531542034017n, 5311597067667671581646709998171703828965875677637292315055030353779531404812n]
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

function main() { 
        
    groth16Verify([], new Proof([ 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n ]));

    vm.optimizeRegs();
    const obj = vm.save();
    fs.writeFile('./generated/step1.json', JSON.stringify(obj, null, '\t'), 'utf8', err => {
        console.error(err);
    });
}

try {
    main();
} catch (e) {
    console.error(e);
}
