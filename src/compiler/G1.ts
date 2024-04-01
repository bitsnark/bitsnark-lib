import { EC, ECPoint } from "./algebra/ec";
import { PrimeFieldMember } from "./algebra/prime-field";
import { Register } from "./vm/register";

export class G1 extends EC {

    static prime = Register.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
    static ec_a = Register.hardcoded(0n);
    static ec_b = Register.hardcoded(3n);
    static gen_x = Register.hardcoded(1n);
    static gen_y = Register.hardcoded(2n);

    generator: ECPoint;

    constructor() {
        super(new PrimeFieldMember(G1.prime, G1.ec_a), new PrimeFieldMember(G1.prime, G1.ec_b));
        this.generator = this.makePoint(new PrimeFieldMember(G1.gen_x), new PrimeFieldMember(G1.gen_y));
    }
}
