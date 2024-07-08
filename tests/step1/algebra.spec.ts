import { expect } from 'chai';
import { Fp } from '../../src/generator/step1/algebra/fp';
import { Fp2 } from '../../src/generator/step1/algebra/fp2';
import { VM, step1_vm as vm } from '../../src/generator/step1/vm/vm';
import { G1, G1Point } from '../../src/generator/step1/algebra/G1';
import { G2, G2Point } from '../../src/generator/step1/algebra/G2';
import { G3, G3Point } from '../../src/generator/step1/algebra/G3';

const _0 = Fp.hardcoded(0n);
const _1 = Fp.hardcoded(1n);
const _2 = Fp.hardcoded(2n);
const _4 = Fp.hardcoded(4n);
const _5 = Fp.hardcoded(5n);
const _7 = Fp.hardcoded(7n);
const _9 = Fp.hardcoded(9n);
const _11 = Fp.hardcoded(11n);
const _12 = Fp.hardcoded(12n);

const x = Fp2.hardcoded(1n, 0n);
const f = Fp2.hardcoded(1n, 2n);
const fpx = Fp2.hardcoded(2n, 2n);

const g1 = new G1();
const g2 = new G2();
const g3 = new G3();

describe('Algebra', () => {

	beforeEach(() => {
		vm.reset();
		vm.startProgram();
	});

	afterEach(() => {
		expect(vm.success?.value).to.eq(1n);
	});

	describe('Fp', () => {

		function checkFp(p1: Fp, p2: Fp) {
			expect(p1.getRegister().value).eq(p2.getRegister().value);
		}

		it('2 * 2 = 4', () => checkFp(_2.mul(_2), _4));
		it('2/7 + 9/7 = 11/7', () => checkFp(_2.div(_7).add(_9.div(_7)), _11.div(_7)));
		it('2*7 + 9*7 = 11*7', () => checkFp(_2.mul(_7).add(_9.mul(_7)), _11.mul(_7)));
	});

	describe('Fp2', () => {

		function checkFp2(p1: Fp2, p2: Fp2) {
			expect(p1.eq(p2).value).eq(1n);
		}

		it('x + f = fpx', () => checkFp2(x.add(f), fpx));
		it('f/f = 1', () => {
			const t1 = f.inv();
			const t2 = f.mul(t1);
			checkFp2(f.div(f), x.one());
		});
		it('1/f + x/f = (1 + x)/f', () => {
			const a = x.one().div(f).add(x.div(f));
			const b = x.one().add(x).div(f);
			checkFp2(a, b);
		});
		it('1*f + x*f = (1 + x)*f', () => checkFp2(x.one().mul(f).add(x.mul(f)), x.one().add(x).mul(f)));
	});

	describe('G1', () => {

		let gen: G1Point;

		beforeEach(() => {
			gen = g1.generator;
		});

		it('add(G1, G1) = double(G1)', () => {
			const a = gen.add(gen);
			const b = gen.double();
			expect(a.eq(b).value).eq(1n);
		});

		it('add(add(double(G1), G1), G1) = double(double(G1))', () => {
			const a = gen.double().add(gen).add(gen);
			const b = gen.double().double();
			expect(a.eq(b).value).eq(1n);
		});

		it('double(G1) != G1', () => {
			expect(gen.eq(gen.double()).value).eq(0n);
		});

		it('add(multiply(G1, 9), multiply(G1, 5)) = add(multiply(G1, 12), multiply(G1, 2))', () => {
			const a = gen.mul(_9.register).add(gen.mul(_5.register));
			const b = gen.mul(_12.register).add(gen.mul(_2.register));
			expect(a.eq(b).value).eq(1n);
		});

		it('assert G1*9', () => {
			const g1times9 = gen.mul(_9.getRegister());
			g1times9.assertPoint();
		});
	});

	describe('G2', () => {

		let gen: G2Point;

		beforeAll(() => {
			gen = g2.generator;
		});

		it('add(add(double(G2), G2), G2) = double(double(G2))', () => {
			const a = gen.double().add(g2.generator!).add(gen);
			const b = gen.double().double();
			expect(a.eq(b).value).eq(1n);
		});

		it('double(G2) != G2', () => {
			expect(gen.eq(gen.double()).value).eq(0n);
		});

		it('add(multiply(G2, 9), multiply(G2, 5)) = add(multiply(G2, 12), multiply(G2, 2))', () => {
			const a = gen.mul(_9.register).add(gen.mul(_5.register));
			const b = gen.mul(_12.register).add(gen.mul(_2.register));
			expect(a.eq(b).value).eq(1n);
		});

		it('assert G2*9', () => {
			const a = gen.mul(_9.register);
			a.assertPoint();
		});
	});
});
