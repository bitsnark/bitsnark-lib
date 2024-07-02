import fs from 'fs';
import groth16Verify, { Key, Proof } from '../../src/generator/step1/verifier';
import { proof, publicSignals } from './proof';
import { step1_vm } from '../../src/generator/step1/vm/vm';
import { Runner } from '../../src/generator/step1/vm/runner';

const vkey_path = './tests/step1/groth16/verification_key.json';


function challenge() {

    const vKey = JSON.parse(fs.readFileSync(vkey_path).toString());    
    groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, publicSignals));
    const saved = step1_vm.save();

    // Vic

    const runner = Runner.load(saved);
    runner.execute();
    if (! runner.success) {
        // do the challenge!
    }
}
