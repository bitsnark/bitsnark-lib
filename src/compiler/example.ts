import { EC_BN128 } from "./ecbn128";

export class Example {

    vm: EC_BN128 = new EC_BN128();

    example() {

        const x = 0x0C6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5n;
        const y = 0x1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52An;

        const r_x = this.vm.allocateRegister();
        this.vm.load(r_x, x, 'x');

        const r_y = this.vm.allocateRegister();
        this.vm.load(r_y, y, 'y');

        this.vm.ecAssertPoint(r_x, r_y);

        const r_2_x = this.vm.allocateRegister();
        const r_2_y = this.vm.allocateRegister();
        this.vm.ecDouble(r_2_x, r_2_y, r_x, r_y);

        this.vm.ecAssertPoint(r_2_x, r_2_y);

        this.vm.print();
    }
}
