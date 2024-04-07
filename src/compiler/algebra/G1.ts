import { EC, ECPoint } from "./ec";
import { PrimeField, PrimeFieldMember } from "./prime-field";
import { Register } from "../vm/state";
import { vm } from "../vm/vm";

const prime: Register = vm.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
const primeField = new PrimeField(prime);
const gen_x = primeField.newMember(vm.hardcoded(1n));
const gen_y = primeField.newMember(vm.hardcoded(2n));
const ec_a = primeField.newMember(vm.hardcoded(0n));
const ec_b = primeField.newMember(vm.hardcoded(3n));

export class G1Point extends ECPoint {
}

// group over elliptic curve over finite field
export class G1 extends EC {

    primeField = primeField;
    generator: G1Point;

    constructor() {
        super(ec_a, ec_b);
        this.generator = this.makePoint(gen_x, gen_y);
    }

    makePoint(x: PrimeFieldMember, y: PrimeFieldMember): G1Point {
        return new G1Point(this, x, y);
    }
}

export const g1 = new G1();
