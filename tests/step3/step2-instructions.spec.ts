import { Bitcoin, SimulatedRegister } from "../../src/generator/step3/bitcoin";

describe("step 1 instructions in step 2 VM", function () {

    let zero: SimulatedRegister;
    let one: SimulatedRegister;
    let two: SimulatedRegister;
    let ten: SimulatedRegister;
    let million: SimulatedRegister;
    let million_minus_one: SimulatedRegister;
    let two_million: SimulatedRegister;
    let three_million: SimulatedRegister;
    let max32: SimulatedRegister;
    let max32_minus_million: SimulatedRegister;

    let bitcoin: Bitcoin;

    beforeEach(() => {
        bitcoin = new Bitcoin();
        zero = bitcoin.newSimulatedRegister(0n);
        one = bitcoin.newSimulatedRegister(1n);
        two = bitcoin.newSimulatedRegister(2n);
        ten = bitcoin.newSimulatedRegister(10n);
        million = bitcoin.newSimulatedRegister(1000000n);
        million_minus_one = bitcoin.newSimulatedRegister(999999n);
        two_million = bitcoin.newSimulatedRegister(2000000n);
        three_million = bitcoin.newSimulatedRegister(3000000n);
        max32 = bitcoin.newSimulatedRegister(4294967295n);
        max32_minus_million = bitcoin.newSimulatedRegister(4294967295n - 1000000n);
    });

    describe('step2_add', () => {

        it("positive", async () => {
            bitcoin.step2_add(million, million, two_million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_add(million, two_million, three_million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_add(max32_minus_million, two_million, million_minus_one);
            expect(bitcoin.success).toBe(true);
        });

        it("negative", async () => {
            bitcoin.step2_add(million, million, million);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('step2_addOf', () => {

        it("positive", async () => {
            bitcoin.step2_addOf(million, million, zero);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_addOf(million, two_million, zero);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_addOf(max32_minus_million, two_million, one);
            expect(bitcoin.success).toBe(true);
        });

        it("negative", async () => {
            bitcoin.step2_addOf(million, million, one);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('step2_sub', () => {

        it("positive", async () => {
            bitcoin.step2_sub(two_million, million, million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_sub(three_million, million, two_million);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_sub(million_minus_one, max32_minus_million, two_million);
            expect(bitcoin.success).toBe(true);
        });

        it("negative", async () => {
            bitcoin.step2_sub(million, million, million);
            expect(bitcoin.success).toBe(false);
        });
    });

    describe('step2_subOf', () => {

        it("positive", async () => {
            bitcoin.step2_subOf(two_million, million, zero);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_subOf(three_million, million, zero);
            expect(bitcoin.success).toBe(true);
            bitcoin.step2_subOf(million, three_million, one);
            expect(bitcoin.success).toBe(true);
        });

        it("negative", async () => {
            bitcoin.step2_subOf(million, two_million, zero);
            expect(bitcoin.success).toBe(false);
        });
    });
});
