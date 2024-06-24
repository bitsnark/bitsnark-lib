import { step2_vm as vm } from "../../src/generator/step2/vm/vm";
import { Bitcoin, SimulatedRegister } from "../../src/generator/step3/bitcoin";

describe("step 1 instructions in step 2 VM", function () {

    let two: SimulatedRegister;
    let ten: SimulatedRegister;
    let million: SimulatedRegister;
    let two_million: SimulatedRegister;
    let three_million: SimulatedRegister;
    let max32: SimulatedRegister;

    let bitcoin: Bitcoin;

    beforeEach(() => {
        bitcoin = new Bitcoin();
        two = bitcoin.newSimulatedRegister(2n);
        ten = bitcoin.newSimulatedRegister(10n);
        million = bitcoin.newSimulatedRegister(1000000n);
        two_million = bitcoin.newSimulatedRegister(2000000n);
        three_million = bitcoin.newSimulatedRegister(3000000n);
        max32 = bitcoin.newSimulatedRegister(4294967295n);
    });

    describe('step2_add', () => {

        it("positive", async () => {
            bitcoin.step2_add(million, million, two_million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_add(million, two_million, three_million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_add(prime_minus_one, prime_minus_one, prime_minus_two);
            expect(bitcoin.success).toBe(true);
        });

        it("negative", async () => {
            vm.reset();
            vm.step1_addMod(million, million, million);
            expect(vm.success).toBe(false);
        });
    });

});
