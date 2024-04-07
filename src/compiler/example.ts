import { g1 } from "./algebra/G1";
import { g2 } from "./algebra/G2";
import { g3 } from "./algebra/G3";
import { vm } from "./vm/vm";

export class Example {

    example() {

        g1.generator.assertPoint();
        const point1 = g1.generator.double();
        point1.assertPoint();

        g2.generator.assertPoint();
        const point2 = g2.generator.double();
        point2.assertPoint();

        const g3point = g3.twist(point2);
        g3point.assertPoint();

        vm.print();
    }
}
