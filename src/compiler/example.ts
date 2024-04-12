import { g1, G1Point } from "./algebra/G1";
import { g2, G2Point } from "./algebra/G2";
import { pairing, twist } from "./algebra/pairing";
import { vm } from "./vm/vm";

export class Example {

    example() {

        g1.generator.assertPoint();
        const point1 = g1.generator.double() as G1Point;
        point1.assertPoint();

        const point2 = g2.generator.double() as G2Point;
        point2.assertPoint();

        const g3point = twist(point2);
        g3point.assertPoint();

        const pp = pairing(point2, point1);
        console.log(pp);

        vm.print();
    }
}
