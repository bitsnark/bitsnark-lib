
import groth16Verify, { Key, Proof as Step1_Proof } from './verifier';
import { step1_vm } from './vm/vm';
import { InstrCode as Step1_InstrCode } from './vm/types';
import { SavedVm } from '../common/saved-vm';
import { proof, vKey } from './constants';

type Step1Program = SavedVm<Step1_InstrCode>;

function step1(): Step1Program {
    // const publicSignals = ["19820469076730107577691234630797803937210158605698999776717232705083708883456", "11"];

    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    step1_vm.optimizeRegs();
    if (!step1_vm.success?.value) throw new Error('Failed.');
    return step1_vm.save();
}

step1();
