import { Complex } from "./algebra/complex";
import { EC, ECPoint } from "./algebra/ec";
import { PrimeFieldMember } from "./algebra/prime-field";
import { vm } from "./vm/vm";

// group over elliptic curve over complex plane over finite field
export class G2 extends EC {

    generator: ECPoint;

    constructor() {
        const prime = vm.hardcoded('g2 prime', 21888242871839275222246405745257275088696311157297823662689037894645226208583n);
        const ec_a = new Complex(prime, [new PrimeFieldMember(vm.R_0), new PrimeFieldMember(vm.R_0)]);
        const ec_b = new Complex(prime, [
            new PrimeFieldMember(prime, vm.state.hardcoded('g2 b1', 3n)),
            new PrimeFieldMember(prime, vm.R_0)]).div(new Complex(prime, [
                new PrimeFieldMember(prime, vm.hardcoded('g2 b2', 9n)),
                new PrimeFieldMember(prime, vm.hardcoded('g2 b2', 1n))])) as Complex;

        super(ec_a, ec_b);

        this.generator = new ECPoint(this, new Complex(prime, [
            new PrimeFieldMember(prime, vm.hardcoded('g2 gxr', 10857046999023057135944570762232829481370756359578518086990519993285655852781n)),
            new PrimeFieldMember(prime, vm.hardcoded('g2 gci', 11559732032986387107991004021392285783925812861821192530917403151452391805634n))
        ]), new Complex(prime, [
            new PrimeFieldMember(prime, vm.hardcoded('g2 gyr', 8495653923123431417604973247489272438418190587263600148770280649306958101930n)),
            new PrimeFieldMember(prime, vm.hardcoded('g2 gyi', 4082367875863433681332203403145435568316851327593401208105741076214120093531n))]));
    }
}
