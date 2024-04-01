import { G1 } from "./G1";
import { G2 } from "./G2";
import { vm } from "./vm/vm";

export class Example {

    g1 = new G1();
    g2 = new G2();

    example() {

        this.g1.generator.assertPoint();

        const point2 = this.g1.generator.double();
        point2.assertPoint();

        vm.print();
    }
}
