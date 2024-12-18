import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { step1_vm } from '../../../src/generator/ec_vm/vm/vm';
import { SavedVm } from '../../generator/common/saved-vm';
import { InstrCode } from '../../generator/ec_vm/vm/types';
import { defaultValidProof, defaultVerificationKey } from '../../generator/ec_vm/constants';
import fs from 'node:fs';
import { Runner } from '../../../src/generator/ec_vm/vm/runner';

const path = './generated/verifier.json';

const programCache: { [key: string]: SavedVm<InstrCode> } = {};

export function loadProgram(proof_bigint?: bigint[]): SavedVm<InstrCode> {
    if (!proof_bigint) {
        if (programCache['default']) return programCache['default'];
        const saved = JSON.parse(fs.readFileSync(path).toString('utf-8'));
        programCache['default'] = saved;
        return saved;
    }

    const witness = proof_bigint.map((n) => n.toString());
    const key = witness.join(',');
    if (programCache[key]) return programCache[key];

    const saved = JSON.parse(fs.readFileSync(path).toString('utf-8')) as SavedVm<InstrCode>;
    saved.witness = proof_bigint.map((n) => n.toString());
    programCache[key] = saved;

    return saved;
}

function generateProgram(): SavedVm<InstrCode> {
    console.log('Running GROTH16 verifier...');

    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(defaultVerificationKey), Step1_Proof.fromSnarkjs(defaultValidProof));

    if (!step1_vm.success?.value) throw new Error('GROTH16 verifier failed.');

    console.log('Optimizing...');

    step1_vm.optimizeRegs();

    const saved = step1_vm.save();

    return saved;
}

export function main() {
    const program = generateProgram();

    fs.writeFileSync(path, JSON.stringify(program));

    console.log('Saved.');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
