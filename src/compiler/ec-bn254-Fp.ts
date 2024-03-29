import { EC, ECPoint } from "./algebra/ec";
import { PrimeField } from "./algebra/prime-field";
import { Register } from "./register";

export class EC_BN254_Fp extends EC {

    static PRIME = 0x2523648240000001BA344D80000000086121000000000013A700000000000013n;
    static EC_A = 0n;
    static EC_B = 2n;
    static G_X = 0x2523648240000001BA344D80000000086121000000000013A700000000000012n;
    static G_Y = 0x0000000000000000000000000000000000000000000000000000000000000001n;
    static R_P = Register.hardcoded(EC_BN254_Fp.PRIME);

    primeField: PrimeField;

    constructor() {
        const r_ec_a = Register.hardcoded(EC_BN254_Fp.EC_A);
        const r_ec_b = Register.hardcoded(EC_BN254_Fp.EC_B);
        const primeField = new PrimeField(EC_BN254_Fp.R_P);
        super(primeField.newMember(r_ec_a), primeField.newMember(r_ec_b));
        this.primeField = primeField;
    }

    makePoint(r_x: Register, r_y: Register): ECPoint {
        const p = new ECPoint();
        p.x = this.primeField.newMember(r_x);
        p.y = this.primeField.newMember(r_y);
        return p;
    }
}
