import { G1 } from "./G1";
import { vm } from "./vm/vm";

export class Example {

    example() {

        G1.generator.assertPoint();

        const point2 = G1.generator.double();
        point2.assertPoint();

        vm.print();
    }
}
