import { expect } from 'chai';
import { Fp, prime_bigint } from '../src/compiler/algebra/fp';
import { Fp2 } from '../src/compiler/algebra/fp2';
import { Fp12 } from '../src/compiler/algebra/fp12';
import { vm } from '../src/compiler/vm/vm';
import { G1, G1Point } from '../src/compiler/algebra/G1';
import { G2, G2Point } from '../src/compiler/algebra/G2';
import { G3, G3Point } from '../src/compiler/algebra/G3';

const _0 = Fp.hardcoded(0n);
const _1 = Fp.hardcoded(1n);
const _2 = Fp.hardcoded(2n);
const _4 = Fp.hardcoded(4n);
const _7 = Fp.hardcoded(7n);
const _9 = Fp.hardcoded(9n);
const _11 = Fp.hardcoded(11n);
const _12 = Fp.hardcoded(12n);

describe('Algebra', () => {

	let g1: G1;
	let g2: G2;
	let g3: G3;

	beforeEach(() => {
		vm.reset();
        Fp.setOptimizeHardcoded(false);
        vm.setCollectInstructions(false);		
		g1 = new G1();
		g2 = new G2();
		g3 = new G3();
	});

	afterEach(() => {
		expect(vm.isFailed()).to.eq(false);
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

		const x = Fp2.hardcoded(1n, 0n);
		const f = Fp2.hardcoded(1n, 2n);
		const fpx = Fp2.hardcoded(2n, 2n);
		const one = x.one();

		it('x + f = fpx', () => checkFp2(x.add(f), fpx));
		it('f/f = 1', () => checkFp2(f.div(f), one));
		it('1/f + x/f = (1 + x)/f', () => checkFp2(one.div(f).add(x.div(f)), one.add(x).div(f)));
		it('1*f + x*f = (1 + x)*f', () => checkFp2(one.mul(f).add(x.mul(f)), one.add(x).mul(f)));
	});

	describe('Fp12', () => {

		function checkFp12(p1: Fp12, p2: Fp12) {
			expect(p1.eq(p2).value).eq(1n);
		}

		const x = Fp12.hardcoded([1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
		const f = Fp12.hardcoded([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n]);
		const fpx = Fp12.hardcoded([2n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n]);
		const one = fpx.one();

		it('x + f = fpx', () => checkFp12(x.add(f), fpx));
		it('f/f = 1', () => checkFp12(f.div(f), one));
		it('1/f + x/f = (1 + x) / f', () => checkFp12(one.div(f).add(x.div(f)), one.add(x).div(f)));
		it('x**(prime**12 - 1) = 1', () => checkFp12(x.powHardcoded(prime_bigint ** 12n - 1n), one));
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
			const a = gen.mul(vm.hardcoded(9n)).add(gen.mul(vm.hardcoded(5n)));
			const b = gen.mul(vm.hardcoded(12n)).add(gen.mul(vm.hardcoded(2n)));
			expect(a.eq(b).value).eq(1n);
		});

		it('assert G1*9', () => {
			const a = gen.mul(vm.hardcoded(9n));
			expect(() => a.assertPoint()).to.not.throw();
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
			const a = gen.mul(vm.hardcoded(9n)).add(gen.mul(vm.hardcoded(5n)));
			const b = gen.mul(vm.hardcoded(12n)).add(gen.mul(vm.hardcoded(2n)));
			expect(a.eq(b).value).eq(1n);
		});

		it('assert G2*9', () => {
			const a = gen.mul(vm.hardcoded(9n));
			expect(() => a.assertPoint()).to.not.throw();
		});
	});

	describe('G3', () => {

		let gen: G3Point;

		beforeAll(() => {
			gen = g3.getGenerator(g2);
		});

		it('add(add(double(G3), G3), G3) = double(double(3))', () => {
			const a = gen.double().add(gen).add(gen);
			const b = gen.double().double();
			expect(a.eq(b).value).eq(1n);
		});

		it('double(G3) != G3', () => {
			expect(gen.eq(gen.double()).value).eq(0n);
		});

		it.skip('add(multiply(G3, 9), multiply(G3, 5)) = add(multiply(G3, 12), multiply(G3, 2))', () => {
			const a = gen.mul(vm.hardcoded(9n)).add(gen.mul(vm.hardcoded(5n)));
			console.log(a.toString());
			const b = gen.mul(vm.hardcoded(12n)).add(gen.mul(vm.hardcoded(2n)));
			console.log(b.toString());
			expect(a.eq(b).value).eq(1n);
		});

		it.skip('assert G3*9', () => {
			const a = gen.mul(vm.hardcoded(9n));
			expect(() => a.assertPoint()).to.not.throw();
		});
	});
});
