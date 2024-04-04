import { G1 } from "./G1";
//import { G2 } from "./G2";
import { Bitcoin } from "./vm/bitcoin/bitcoin";
import { InstrCode, vm } from "./vm/vm";

export class Example {

    example() {

        const g1 = new G1();
        g1.generator.assertPoint();
        const point2 = g1.generator.double();
        point2.assertPoint();

        // const g2 = new G2();
        // g2.generator.assertPoint();
        // const point3 = g2.generator.double();
        // point3.assertPoint();
        
        //vm.print();

        for (let i = 0; i < vm.instructions.length; i++) {
            if (vm.instructions[i].name == InstrCode.ADDMOD) {
                Bitcoin.generate(vm, i);
                return;
            }
        }
    }
}
