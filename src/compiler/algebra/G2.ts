import { Complex, ComplexField } from "./complex";
import { EC, ECPoint } from "./ec";
import { PrimeField } from "./prime-field";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

const prime: Register = vm.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);
const complexField = new ComplexField(primeField);
const ec_a = complexField.newMember(vm.R_0, vm.R_0);
const ec_b = complexField.newMember(
    vm.hardcoded(3n), vm.R_0)
    .div(complexField.newMember(vm.hardcoded(9n), vm.hardcoded(1n)));

export class G2Point extends ECPoint {
    this_is_a_g2_point = 0;
}

// group over elliptic curve over complex plane over finite field
export class G2 extends EC {

    primeField = primeField;
    complexField = complexField;
    generator: G2Point;

    constructor() {
        super(ec_a, ec_b);
        this.generator = this.makePoint(
            complexField.newMember(
                vm.hardcoded(10857046999023057135944570762232829481370756359578518086990519993285655852781n),
                vm.hardcoded(11559732032986387107991004021392285783925812861821192530917403151452391805634n)),
            complexField.newMember(
                vm.hardcoded(8495653923123431417604973247489272438418190587263600148770280649306958101930n),
                vm.hardcoded(4082367875863433681332203403145435568316851327593401208105741076214120093531n)));
    }

    makePoint(x: Complex, y: Complex): G2Point {
        return new G2Point(this, x, y);
    }
}

export const g2 = new G2();
