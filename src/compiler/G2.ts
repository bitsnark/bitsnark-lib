import { Complex } from "./algebra/complex";
import { EC, ECPoint } from "./algebra/ec";
import { PrimeFieldMember } from "./algebra/prime-field";
import { R_0, Register } from "./vm/register";

export class G2 extends EC {

    static prime = Register.hardcoded(21888242871839275222246405745257275088696311157297823662689037894645226208583n);
    static ec_a = new Complex(G2.prime, [new PrimeFieldMember(R_0), new PrimeFieldMember(R_0)]);
    static ec_b = new Complex(G2.prime, [
        new PrimeFieldMember(G2.prime, Register.hardcoded(3n)),
        new PrimeFieldMember(G2.prime, R_0)]).div(new Complex(G2.prime, [
            new PrimeFieldMember(G2.prime, Register.hardcoded(9n)),
            new PrimeFieldMember(G2.prime, Register.hardcoded(1n))])) as Complex;

    static generator = new ECPoint(G2.ec_a, G2.ec_b, new Complex(this.prime, [
        new PrimeFieldMember(G2.prime, Register.hardcoded(10857046999023057135944570762232829481370756359578518086990519993285655852781n)),
        new PrimeFieldMember(G2.prime, Register.hardcoded(11559732032986387107991004021392285783925812861821192530917403151452391805634n))
    ]), new Complex(this.prime, [
        new PrimeFieldMember(G2.prime, Register.hardcoded(8495653923123431417604973247489272438418190587263600148770280649306958101930n)),
        new PrimeFieldMember(G2.prime, Register.hardcoded(4082367875863433681332203403145435568316851327593401208105741076214120093531n))]));

    constructor() {
        super(G2.ec_a, G2.ec_b);
    }
}
