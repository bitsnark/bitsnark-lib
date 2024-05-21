import { expect } from 'chai';

import { Fp12 } from "../src/generator/step1/algebra/fp12";
import { G1, G1Point } from "../src/generator/step1/algebra/G1";
import { G2, G2Point } from "../src/generator/step1/algebra/G2";
import { vm } from '../src/generator/step1/vm/vm';
import { curveOrder, G3 } from '../src/generator/step1/algebra/G3';

describe('Pairing', () => {

    let gen1: G1Point;
    let gen2: G2Point;

    let g1: G1;
    let g2: G2;
    let g3: G3;

    beforeEach(() => {
        vm.reset();
        g1 = new G1();
        g2 = new G2();
        g3 = new G3();

        gen1 = g1.generator;
        gen2 = g2.generator;
    });

    afterEach(() => {
        expect(vm.success).to.eq(true);
    });

    it('Pairing check against negative in G1', () => {
        const p1 = g3.pairing(gen2, gen1);
        const pn1 = g3.pairing(gen2, gen1.neg());
        const t1 = p1.mul(pn1);
        const t2 = Fp12.one();
        expect(t1.eq(t2).value).eq(1n);
    });

    it('Pairing check against negative in G2', () => {
        const p1 = g3.pairing(gen2, gen1);
        const np1 = g3.pairing(gen2.neg(), gen1);
        const t1 = p1.mul(np1);
        const t2 = Fp12.one();
        expect(t1.eq(t2).value).eq(1n);
    });

    it('Pairing output has correct order', () => {
        const p1 = g3.pairing(gen2, gen1);
        const t = p1.powHardcoded(curveOrder);
        expect(t.eq(Fp12.one()).value).eq(1n);
    });

    it('Pairing bilinearity in G1', () => {
        const _2 = vm.hardcode(2n);
        const p1 = g3.pairing(gen2, gen1);
        const p2 = g3.pairing(gen2, gen1.double());
        const t = p1.mul(p1);
        expect(t.eq(p2).value).eq(1n);
    });

    it('Pairing is non-degenerate', () => {
        const p1 = g3.pairing(gen2, gen1);
        const p2 = g3.pairing(gen2, gen1.double());
        const np1 = g3.pairing(gen2.neg(), gen1);
        expect(p1.eq(p2).value).eq(0n);
        expect(p1.eq(np1).value).eq(0n);
        expect(p2.eq(np1).value).eq(0n);
    });

    it('Pairing bilinearity in G2', () => {
        const p1 = g3.pairing(gen2, gen1);
        const po2 = g3.pairing(gen2.double(), gen1);
        const t = p1.mul(p1);
        expect(t.eq(po2).value).eq(1n);
    });

    it('Composite check passed', () => {
        const _27 = vm.hardcode(27n);
        const _37 = vm.hardcode(37n);
        const _999 = vm.hardcode(999n);
        const p3 = g3.pairing(gen2.mul(_27), gen1.mul(_37));
        const po3 = g3.pairing(gen2, gen1.mul(_999));
        expect(p3.eq(po3).value).eq(1n);
    });
});
