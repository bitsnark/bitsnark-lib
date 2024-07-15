import { step2_vm } from '../../src/generator/step2/vm/vm';
import { SHA256 } from '../../src/generator/step2/sha-256';
import { Register } from '../../src/generator/common/register';
import { _256To32BE, _32To256BE, hash, hashPair } from '../../src/encoding/encoding';

describe("SHA256 tests", function () {
    const n = 123456789012345678901234567890n;
    const n1 = 123456789012345678901234567890n;
    const n2 = 98765432109876543210987654321n;

    it ('just in case', () => {
        
        const tn = _32To256BE(_256To32BE(n));
        expect(tn).toEqual(n);
    });
    
    it('single value hash', () => {
        
        step2_vm.reset();
        const h1 = hash(n);
        const regs: Register[] = _256To32BE(n).map(n => step2_vm.addWitness(n));
        step2_vm.startProgram();
        const sha256 = new SHA256();
        const h2regs = step2_vm.newTemp256();
        sha256.sha256(h2regs, regs);
        let h2 = _32To256BE(h2regs.map(r => r.value));
        expect(h1).toEqual(h2);
        sha256.free();
        console.log('registers: ', step2_vm.registers.filter(r => !r.hardcoded).length);
    });

    it('pair hash', () => {

        step2_vm.reset();
        const h1 = hashPair(n1, n2);
        const aRegs: Register[] = _256To32BE(n1).map(n => step2_vm.addWitness(n));
        const bRegs: Register[] = _256To32BE(n2).map(n => step2_vm.addWitness(n));
        const targetRegs: Register[] = [];
        for (let i = 0; i < 8; i++) targetRegs.push(step2_vm.newRegister());
        step2_vm.startProgram();
        const sha256 = new SHA256();
        sha256.sha256pair(targetRegs, aRegs, bRegs);
        let h2 = _32To256BE(targetRegs.map(r => r.value));
        expect(h1).toEqual(h2);
        sha256.free();
        console.log('registers: ', step2_vm.registers.filter(r => !r.hardcoded).length);
    });

});
