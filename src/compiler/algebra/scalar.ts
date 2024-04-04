import { Register } from "../vm/state";
import { vm } from "../vm/vm";
import { PrimeFieldMember } from "./prime-field";

export class Scalar extends PrimeFieldMember {

    constructor(r?: Register) {
        super(vm.R_P0, r);
    }
}
