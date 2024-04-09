import { EC, ECPoint } from "./ec";
import { ExtensionField, ExtensionMember } from "./extension";
import { PrimeField } from "./prime-field";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";
import { PolynomialOverPrimeField } from "./polynomial";

const degree = vm.hardcoded(12n);
const prime: Register = vm.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);
const polyField = new PolynomialOverPrimeField(primeField, Number(degree.getValue()));
const base = polyField.newMember(
    [82n, 0n, 0n, 0n, 0n, 0n, -18n, 0n, 0n, 0n, 0n, 0n]
        .map(c => primeField.newMember(vm.hardcoded(c))));

const extField = new ExtensionField(base);

const ec_a = extField.newMember();
const ec_b = extField.newMember(
    polyField.newMember(
        [3n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n]
            .map(c => primeField.newMember(vm.hardcoded(c)))));

export class G3Point extends ECPoint {
}

// group over elliptic curve over polynomial field over finite field
export class G3 extends EC {

    static extField = extField;
    static polyField = polyField;
    static primeField = primeField;

    constructor() {
        super(ec_a, ec_b);
    }

    makePoint(x: ExtensionMember, y: ExtensionMember): G3Point {
        return new G3Point(this, x, y);
    }
}

export const g3 = new G3();
