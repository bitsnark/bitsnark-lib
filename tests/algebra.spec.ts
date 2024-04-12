import { expect } from 'chai';
import { g1 } from '../src/compiler/algebra/G1';
import { PrimeFieldMember } from '../src/compiler/algebra/prime-field';
import { Complex } from '../src/compiler/algebra/complex';
import { g2 } from '../src/compiler/algebra/G2';
import { G3, g3 } from '../src/compiler/algebra/G3';
import { ExtensionMember } from '../src/compiler/algebra/extension';
import { modPow } from '../src/compiler/common/math-utils';

const _0 = g1.primeField.newHardcoded(0n);
const _1 = g1.primeField.newHardcoded(1n);
const _2 = g1.primeField.newHardcoded(2n);
const _4 = g1.primeField.newHardcoded(4n);
const _7 = g1.primeField.newHardcoded(7n);
const _9 = g1.primeField.newHardcoded(9n);
const _11 = g1.primeField.newHardcoded(11n);
const _12 = g1.primeField.newHardcoded(12n);

describe('Algebra', () => {
	describe('Fp', () => {

		it('0 - 1 = p - 1', () => {
			expect((_0.sub(_1) as PrimeFieldMember).getRegister().getValue())
				.eq(g1.primeField.prime.getValue() - 1n);
		});

		function checkFp(p1: any, p2: any) {
			expect(p1).instanceOf(PrimeFieldMember);
			expect(p2).instanceOf(PrimeFieldMember);
			expect(p1.getRegister().getValue()).eq(p2.getRegister().getValue());
		}

	
		const a = _0.sub(_1).div(_12);
		const b = _0.sub(_1).div(_7);
		const c = _0.sub(_1).div(_9);

		it('2*2 = 4', () => checkFp(_2.mul(_2), _4));
		it('2/7 + 9/7 = 11/7', () => checkFp(_2.div(_7).add(_9.div(_7)), _11.div(_7)));
		it('2*7 + 9*7 = 11*7', () => checkFp(_2.mul(_7).add(_9.mul(_7)), _11.mul(_7)));
		it('a**b * a**c = a**(c + b)', 
			() => checkFp(a.pow(b).mul(a.pow(c)), a.pow(c.add(b))));
		it('a**b**c = a**(b * c)', 
			() => checkFp(a.pow(b).pow(c), a.pow(c.mul(b))));
	});

	describe('Fp2', () => {

		function checkFp2(p1: any, p2: any) {
			expect(p1).instanceOf(Complex);
			expect(p2).instanceOf(Complex);
			expect(p1.eq(p2).getValue()).eq(1n);
		}

		const x = g2.complexField.hardcoded(1n, 0n);
		const f = g2.complexField.hardcoded(1n, 2n);
		const fpx = g2.complexField.hardcoded(2n, 2n);
		const one = x.one();
		const a = g2.complexField.hardcoded(12341234123412341234123412341234n, 98739873987398739873987398739873n);
		const b = g1.primeField.newHardcoded(34563456345634563456345634563453n);
		const c = g1.primeField.newHardcoded(7824578245782457824578245n);
	
		it('x + f = fpx', () => checkFp2(x.add(f), fpx));
		it('f/f = 1', () => checkFp2(f.div(f), one));
		it('1/f + x/f = (1 + x)/f', () => checkFp2(one.div(f).add(x.div(f)), one.add(x).div(f)));
		it('1*f + x*f = (1 + x)*f', () => checkFp2(one.mul(f).add(x.mul(f)), one.add(x).mul(f)));
		it('a**b * a**c = a**(c + b)', 
			() => checkFp2(a.pow(b).mul(a.pow(c)), a.pow(b.add(c))));
		it('a**b**c = a**(b * c)', 
			() => checkFp2(a.pow(b).pow(c), a.pow(c.mul(b))));
	});

	describe('Fp12', () => {
		function checkFp12(p1: any, p2: any) {
			expect(p1).instanceOf(ExtensionMember);
			expect(p2).instanceOf(ExtensionMember);
			expect(p1.eq(p2).getValue()).eq(1n);
		}
	
		const x = G3.extField.hardcoded([1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]);
		const f = G3.extField.hardcoded([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n]);
		const fpx = G3.extField.hardcoded([2n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n, 11n, 12n]);
		const one = fpx.one();
		const a = G3.extField.hardcoded([1343234n, 34523453n, 35674567n, 456745674n, 678956785n, 34563456346n, 4256356425n, 2346164n, 36735673576n, 23646n, 23462364n, 9870867976n]);
		const b = g1.primeField.newHardcoded(34563456345634563456345634563453n);
		const c = g1.primeField.newHardcoded(7824578245782457824578245n);

		it('x + f = fpx', () => checkFp12(x.add(f), fpx));
		it('f/f = 1', () => checkFp12(f.div(f), one));
		it('1/f + x/f = (1 + x) / f', () => checkFp12(one.div(f).add(x.div(f)), one.add(x).div(f)));
		it('a**b * a**c = a**(c + b)', 
			() => checkFp12(a.pow(b).mul(a.pow(c)), a.pow(b.add(c))));
		it('a**b**c = a**(b * c)', 
			() => checkFp12(a.pow(b).pow(c), a.pow(c.mul(b))));
	});
});
