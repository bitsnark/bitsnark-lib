import { EC, ECPoint } from "./ec";
import { Fp2 } from "./fp2";

export class G2Point extends ECPoint<Fp2> {
}

// group over elliptic curve over complex plane over finite field
export class G2 extends EC<Fp2> {

    generator: G2Point;

    constructor() {
        const ec_a = new Fp2();
        const ec_b = Fp2.hardcoded(3n, 0n).div(Fp2.hardcoded(9n, 1n));
        super(ec_a, ec_b);
        const gen_x = Fp2.hardcoded(
            10857046999023057135944570762232829481370756359578518086990519993285655852781n,
            11559732032986387107991004021392285783925812861821192530917403151452391805634n);
        const gen_y = Fp2.hardcoded(
            8495653923123431417604973247489272438418190587263600148770280649306958101930n,
            4082367875863433681332203403145435568316851327593401208105741076214120093531n);
        this.generator = this.makePoint(gen_x, gen_y);
    }

    makePoint(x: Fp2, y: Fp2): G2Point {
        return new G2Point(this, x, y);
    }
}
