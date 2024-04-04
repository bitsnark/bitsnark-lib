import { EC, ECPoint } from "./algebra/ec";
import { PrimeFieldMember } from "./algebra/prime-field";
import { Register } from "./vm/state";
import { vm } from "./vm/vm";

// group over elliptic curve over finite field
export class G1 extends EC {

    static prime: Register = vm.hardcoded('G1 prime', 21888242871839275222246405745257275088696311157297823662689037894645226208583n);
    generator: ECPoint;

    constructor() {
        const gen_x = new PrimeFieldMember(G1.prime, vm.hardcoded('g1 gx', 1n));
        const gen_y = new PrimeFieldMember(G1.prime, vm.hardcoded('g1 gy', 2n));
        const ec_a = new PrimeFieldMember(G1.prime, vm.hardcoded('g1 a', 0n));
        const ec_b = new PrimeFieldMember(G1.prime, vm.hardcoded('g1 b', 3n));
        super(ec_a, ec_b);
        this.generator = new ECPoint(this, gen_x, gen_y);
    }
}
