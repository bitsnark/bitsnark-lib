import { Fp } from "./algebra/fp";
import { G1 } from "./algebra/G1";
import { G2 } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { regOptimizer } from "./vm/reg-optimizer";
import { vm } from "./vm/vm";

export class Example {

    example() {


        const g1 = new G1();
        const g2 = new G2();
        const g3 = new G3();

        g1.generator.assertPoint();
        const point1 = g1.generator.double();
        point1.assertPoint();

        const point2 = g2.generator.double();
        point2.assertPoint();

        const g3point = g3.twist(point2);
        g3point.assertPoint();

        const pp = g3.pairing(point2, point1);
        console.log('Pairing result: ', pp);

        console.log('Instruction count: ', vm.getCurrentInstruction());
        console.log('Register count: ', vm.state.registers.length);

        regOptimizer(vm);
    }
}
