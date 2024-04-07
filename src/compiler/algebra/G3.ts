import { EC, ECPoint } from "./ec";
import { ExtensionMember } from "./extension";
import { Polynomial, PolynomialOverPrimeField } from "./polynomials";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { G2Point } from "./G2";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

const nine = new PrimeFieldMember(vm.hardcoded('', 9n));
const degree = 12;
const prime: Register = vm.hardcoded('G2 prime', 21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);
const polyField = new PolynomialOverPrimeField(primeField, degree);
const base = polyField.newMember(
    [82n, 0n, 0n, 0n, 0n, 0n, -18n, 0n, 0n, 0n, 0n, 0n]
        .map(c => primeField.newMember(vm.hardcoded('', c))));

const w = new ExtensionMember(
    base,
    polyField.newMember(
        [0n, 1n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(n => primeField.newMember(vm.hardcoded('', n)))));
const w_2 = w.mul(w) as ExtensionMember;
const w_3 = w_2.mul(w) as ExtensionMember;

const fiveZeros = Array(5).map(() => primeField.newMember(vm.R_0));
    
const ec_a = new ExtensionMember(base, polyField.newMember());
const ec_b = new ExtensionMember(
    base,
    polyField.newMember(
        [3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(c => primeField.newMember(vm.hardcoded('', c)))));

export class G3Point extends ECPoint {
}

// group over elliptic curve over polynomial field over finite field
export class G3 extends EC {

    primeField = primeField;
    polyField = polyField;

    constructor() {
        super(ec_a, ec_b);
    }

    makePoint(x: ExtensionMember, y: ExtensionMember): G3Point {
        return new G3Point(this, x, y);
    }

    twist(pt: G2Point): G3Point {
        const x = pt.x as Polynomial;
        const y = pt.y as Polynomial;
        const xcoeffs = [
            x.coeffs[0].sub(x.coeffs[1].mul(nine)) as PrimeFieldMember,
            x.coeffs[1]];
        const ycoeffs = [
            y.coeffs[0].sub(y.coeffs[1].mul(nine)) as PrimeFieldMember,
            y.coeffs[1]];
        const nx = this.polyField.newMember(
            [xcoeffs[0],
            ...fiveZeros,
            xcoeffs[1],
            ...fiveZeros]);
        const ny = this.polyField.newMember(
            [ycoeffs[0],
            ...fiveZeros,
            ycoeffs[1],
            ...fiveZeros]);

        return this.makePoint(w_2.mul(nx) as ExtensionMember, w_3.mul(ny) as ExtensionMember);
    }
}

export const g3 = new G3();
