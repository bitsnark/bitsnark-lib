import { Register, SHA256 } from '../../src/generator/step3/sha-256';
import { _256To32BE, _32To256BE, hash, hashPair } from '../../src/encoding/encoding';
import { Bitcoin } from '../../src/generator/step3/bitcoin';

describe("SHA256 tests", function () {
    const test1 = 123456789012345678901234567890n;
    const n1 = 123456789012345678901234567890n;
    const n2 = 98765432109876543210987654321n;

    it('just in case', () => {
        const tn = _32To256BE(_256To32BE(test1));
        expect(tn).toEqual(test1);
    });

    it('single value hash', () => {

        const h1 = hash(test1);
        const bitcoin = new Bitcoin();
        bitcoin.stackLimit = false;
        const sha256 = new SHA256(bitcoin);
        const regs: Register[] = _256To32BE(test1).map(n => sha256.hardcodeRegister(n));
        const h2regs = _256To32BE(0n).map(n => sha256.hardcodeRegister(n));
        sha256.sha256(h2regs, regs);
        const h2 = _32To256BE(h2regs.map(r => sha256.registerToBigint(r)));
        expect(h1).toEqual(h2);
        sha256.free();
    });

    // it('pair hash', () => {

    //     step2_vm.reset();
    //     const h1 = hashPair(n1, n2);
    //     const aRegs: Register[] = _256To32BE(n1).map(n => step2_vm.addWitness(n));
    //     const bRegs: Register[] = _256To32BE(n2).map(n => step2_vm.addWitness(n));
    //     const targetRegs: Register[] = [];
    //     for (let i = 0; i < 8; i++) targetRegs.push(step2_vm.newRegister());
    //     step2_vm.startProgram();
    //     const sha256 = new SHA256();
    //     sha256.sha256pair(targetRegs, aRegs, bRegs);
    //     const h2 = _32To256BE(targetRegs.map(r => r.value));
    //     expect(h1).toEqual(h2);
    //     sha256.free();
    // });

});
