import crypto from 'crypto';
import { hash, hashPair, padHex } from '../encoding';
import { step2_vm } from '../../src/generator/step2/vm/vm';
import { sha256, sha256pair } from '../../src/generator/step2/sha-256';
import { Register } from '../../src/generator/common/register';


function _256To32(n: bigint): bigint[] {
    const result: bigint[] = [];
    let s = padHex(n.toString(16), 32);
    for (let i = 0; i < 8; i++) {
        const t = s.slice(i * 8, (i + 1) * 8);
        result.push(BigInt('0x' + t));
    }
    return result;
}

function _32To256(na: bigint[]): bigint {
    let s = '';
    for (let i = 0; i < 8; i++) {
        s = s + padHex(na[i].toString(16), 4);
    }
    return BigInt('0x' + s);
}

describe("SHA256 tests", function () {
    const n = 123456789012345678901234567890n;
    const n1 = 123456789012345678901234567890n;
    const n2 = 98765432109876543210987654321n;

    it ('just in case', () => {

        const tn = _32To256(_256To32(n));
        expect(tn).toEqual(n);
    });

    it('single value hash', () => {

        step2_vm.reset();
        const h1 = hash(n);
        const regs: Register[] = _256To32(n).map(n => step2_vm.addWitness(n));
        const h2regs = sha256(regs);
        let h2 = _32To256(h2regs.map(r => r.value));
        expect(h1).toEqual(h2);
    });

    it('pair hash', () => {

        step2_vm.reset();
        const h1 = hashPair(n1, n2);
        const aRegs: Register[] = _256To32(n1).map(n => step2_vm.addWitness(n));
        const bRegs: Register[] = _256To32(n2).map(n => step2_vm.addWitness(n));
        const targetRegs: Register[] = [];
        for (let i = 0; i < 8; i++) targetRegs.push(step2_vm.newRegister());
        sha256pair(targetRegs, aRegs, bRegs);
        let h2 = _32To256(targetRegs.map(r => r.value));
        expect(h1).toEqual(h2);
    });
});
