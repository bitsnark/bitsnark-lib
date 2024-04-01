import { EC_BN254_Fp } from "./ec-bn254-Fp";
import { Register } from "./vm/register";
import { vm } from "./vm/vm";

export class Example {

    ec = new EC_BN254_Fp();

    example() {

        const r_x = Register.hardcoded(EC_BN254_Fp.G_X);
        const r_y = Register.hardcoded(EC_BN254_Fp.G_Y);

        const point1 = this.ec.makePoint(r_x, r_y);
        this.ec.assertPoint(point1);

        const point2 = this.ec.double(point1);
        this.ec.assertPoint(point2);

        vm.print();
    }
}
