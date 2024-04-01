import { G1 } from "./G1";
//import { G2 } from "./G2";
import { vm } from "./vm/vm";

export class Example {

    example() {

        G1.generator.assertPoint();
        const point2 = G1.generator.double();
        point2.assertPoint();

        //G2.generator.assertPoint();
        // const point2 = G2.generator.double();
        // point2.assertPoint();
        
        vm.print();
    }
}
