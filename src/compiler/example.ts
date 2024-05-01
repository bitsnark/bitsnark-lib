import fs from 'fs';
import { Fp } from "./algebra/fp";
import { G1 } from "./algebra/G1";
import { G2 } from "./algebra/G2";
import { G3 } from "./algebra/G3";
import { regOptimizer } from "./vm/reg-optimizer";
import { vm } from "./vm/vm";

export class Example {

    example() {

        Fp.setOptimizeHardcoded(true);
        vm.setCollectInstructions(true);

        console.log('Initializing...');

        const g1 = new G1();
        const g2 = new G2();
        const g3 = new G3();

        console.log('Calculating points...');

        const point1 = g1.generator.double();
        const point2 = g2.generator.double();
        const point1t = point1.double();
        const point2t = point2.double();
        const point1tt = point1.double();
        const point2tt = point2.double();

        let pp;

        console.log('Paring 1...');
        pp = g3.pairing(point2, point1);
        console.log('Pairing result: ', pp.toString());

        // console.log('Paring 2...');
        // pp = g3.pairing(point2t, point1t);
        // console.log('Pairing result: ', pp.toString());

        // console.log('Paring 3...');
        // pp = g3.pairing(point2tt, point1tt);
        // console.log('Pairing result: ', pp.toString());

        console.log('Instruction count: ', vm.getCurrentInstruction());
        console.log('Witness size: ', vm.witness.items.length);

        regOptimizer(vm);

        const obj = vm.getJson();
        fs.writeFile('./out.json', JSON.stringify(obj, undefined, 4), (err) => {
            if (err) {
                console.log('Error writing file:', err);
            } else {
                console.log('Successfully wrote file');
            }
        });
    }
}
