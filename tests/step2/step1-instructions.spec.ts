import { beforeEach } from "node:test";
import { vm, VM } from "../../src/generator/step2/vm/vm";
import { Register } from "../../src/generator/common/register";
import { prime_bigint } from "../../src/generator/common/prime";

function nTo_256(n: bigint): Register[] {
    const ra: Register[] = [];
    for(let i = 0; i < 8; i++) {
        ra[i] = vm.addWitness(n & 0xffffffffn);
        n = n >> 32n;
    }
    return ra;
}

describe("step 1 instructions in step 2 VM", function () {

    const prime_minus_one = nTo_256(prime_bigint - 1n);
    const prime_half = nTo_256(prime_bigint / 2n);
    const two = nTo_256(2n);
    const ten = nTo_256(10n);
    const million = nTo_256(1000000n);
    const two_million = nTo_256(2000000n);
    const three_million = nTo_256(3000000n);
    const billion = nTo_256(1000000000n);
    const two_billion = nTo_256(2000000000n);
    const trillion = nTo_256(1000000000000n);
    const two_trillion = nTo_256(2000000000000n);
    const prime_minus_two = nTo_256(prime_bigint - 2n);        

    beforeEach(async () => {
        VM.reset();
    });

    describe('step1_addMod', () => {

        it("positive", async () => {
            VM.reset();
            vm.step1_addMod(million, million, two_million);
            expect(vm.success).toBe(true);
            VM.reset();
            vm.step1_addMod(million, two_million, three_million);
            expect(vm.success).toBe(true);
            VM.reset();
            vm.step1_addMod(prime_minus_one, prime_minus_one, prime_minus_two);
            expect(vm.success).toBe(true);
        });

        it("negative", async () => {
            VM.reset();
            vm.step1_addMod(million, million, million);
            expect(vm.success).toBe(false);
        });
    });

    describe('step1_mulMod', () => {

        it("positive", async () => {
            VM.reset();
            vm.step1_mulMod(million, million, trillion);
            expect(vm.success).toBe(true);
            VM.reset();
            vm.step1_mulMod(million, two_million, two_trillion);
            expect(vm.success).toBe(true);
            VM.reset();
            vm.step1_mulMod(prime_minus_one, prime_minus_two, two);
            expect(vm.success).toBe(true);
        });

        it("negative", async () => {
            VM.reset();
            vm.step1_mulMod(million, million, million);
            expect(vm.success).toBe(false);
        });
    });

});
