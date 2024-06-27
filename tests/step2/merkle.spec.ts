import { expect } from 'chai';
import { beforeEach } from "node:test";
import { vm, VM } from "../../src/generator/step2/vm/vm";
import { Register } from "../../src/generator/common/register";
import { sha256, sha256pair } from "../../src/generator/step2/sha-256";
import { _256 } from "../../src/generator/step2/vm/types"

const a_hex: bigint[] = [0x1516f000n, 0xde6cff5cn, 0x8c63eef0n, 0x81ebcec2n, 0xad2fdcf7n, 0x034db160n, 0x45d024a9n, 0x0341e07dn]
const b_hex: bigint[] = [0xe20af19fn, 0x85f26557n, 0x9ead2578n, 0x859bf089n, 0xc92b76a0n, 0x48606983n, 0xad83f27bn, 0xa8f32f1an]
const a_hash_hex: bigint[] = [0x846bea34n, 0x8ecfdf71n, 0xde201960n, 0x619a910bn, 0x11b8e9ben, 0xd9185762n, 0x81f5078bn, 0x08c2d6cen]
const ab_hash_hex: bigint[] = [0x77c654b3n, 0xd1605f78n, 0xed091cbdn, 0x420c939cn, 0x3feff7d5n, 0x7dc30c17n, 0x1fa45a5an, 0x3c81fd7dn]
const areg = vm.initHardcoded(a_hex)
const breg = vm.initHardcoded(b_hex)

describe("SHA256 tests", function () {

    beforeEach(async () => {
        VM.reset();
    });

    function check(got: _256, exp: bigint[]) {
        for (let i = 0; i < 8; i++) {
            expect(got[i].value).eq(exp[i])
        }
    }

    describe('256 bit input hash', () => {
        let got = sha256(areg)
        it("SHA256 A", () => check(got, a_hash_hex))
    })

    describe('512 bit input hash', () => {
        let got = sha256pair(areg, breg)
        it("SHA256 AB", () => check(got, ab_hash_hex))
    })
})
