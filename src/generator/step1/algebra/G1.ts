import { EC, ECPoint } from "./ec";
import { Fp } from "./fp";

export class G1Point extends ECPoint<Fp> {
}

// group over elliptic curve over finite field
export class G1 extends EC<Fp> {

    generator: G1Point;

    constructor() {
        const ec_a = Fp.zero();
        const ec_b = Fp.hardcoded(3n);
        super(ec_a, ec_b);
        const gen_x = Fp.hardcoded(1n);
        const gen_y = Fp.hardcoded(2n);
        this.generator = this.makePoint(gen_x, gen_y);
    }

    makePoint(x: Fp, y: Fp, z?: Fp, t?: Fp): G1Point {
        return new G1Point(this, x, y, z, t);
    }
}
