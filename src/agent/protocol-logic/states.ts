import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { step1_vm } from '../../generator/step1/vm/vm';
import { Decasector } from '../final-step/decasector';
import { proof, vKey } from '../../generator/step1/constants';
import { Runner } from '../../generator/step1/vm/runner';
import { calculateMerkleRoot } from './merkle';

export function calculateStates(proof: bigint[], selectionPath: number[]): Buffer[] {

    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) 
        throw new Error('Failed.');
    const program = step1_vm.instructions;
    const runner = Runner.load(step1_vm.save());
    const decasector = new Decasector(program.length);
    const rows = decasector.getRowsForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const row of rows) {
        runner.execute(row);
        const regs = runner.getRegisterValues();
        const root = calculateMerkleRoot(regs);
        states.push(root);
    }

    return states;
}

export function makeArgument(proof: bigint[], selectionPath: number[]) {

}
