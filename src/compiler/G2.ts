import { EC, ECPoint } from "./algebra/ec";
import { PrimeFieldMember } from "./algebra/prime-field";
import { Register } from "./vm/register";

export class G2 extends EC {

    static prime = Register.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
    static ec_a = Register.hardcoded(0n);
    static ec_b = Register.hardcoded(3n);
    static gen_x_r = Register.hardcoded(10857046999023057135944570762232829481370756359578518086990519993285655852781n);
    static gen_x_i = Register.hardcoded(11559732032986387107991004021392285783925812861821192530917403151452391805634n);
    static gen_y_r = Register.hardcoded(8495653923123431417604973247489272438418190587263600148770280649306958101930n);
    static gen_y_i = Register.hardcoded(4082367875863433681332203403145435568316851327593401208105741076214120093531n);

    generator: ECPoint;

    constructor() {
        super(new PrimeFieldMember(G2.prime, G2.ec_a), new PrimeFieldMember(G2.prime, G2.ec_b));
        this.generator = this.makePoint(new PrimeFieldMember(G1.gen_x), new PrimeFieldMember(G1.gen_y));
    }
}
