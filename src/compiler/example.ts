// import { Complex } from "./algebra/complex";
// import { PrimeFieldMember } from "./algebra/prime-field";
// import { Bitcoin } from "./vm/bitcoin/bitcoin";
// import { InstrCode, vm } from "./vm/vm";

import { g1 } from "./algebra/G1";
import { g2 } from "./algebra/G2";
import { g3 } from "./algebra/G3";

export class Example {

    example() {

        g1.generator.assertPoint();
        const point2 = g1.generator.double();
        point2.assertPoint();

        g2.generator.assertPoint();
        const point3 = g2.generator.double();
        point3.assertPoint();

        g2.generator.assertPoint();
        const g3point = g3.twist(point3);
        g3point.assertPoint();
        
    }
}
