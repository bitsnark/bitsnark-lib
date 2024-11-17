import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import { Decasector } from '../final-step/decasector';
import { vKey } from '../../generator/ec_vm/constants';
import { Runner } from '../../generator/ec_vm/vm/runner';
import { FatMerkleProof } from './fat-merkle';

export async function calculateStates(proof: bigint[], selectionPath: number[]): Promise<Buffer[]> {
    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.instructions;
    const runner = Runner.load(step1_vm.save());
    const decasector = new Decasector(program.length);
    const rows = decasector.getRowsForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const row of rows) {
        runner.execute(row);
        const regs = runner.getRegisterValues();
        const root = await FatMerkleProof.calculateRoot(regs);
        states.push(root);
    }

    return states;
}

export function makeArgument(proof: bigint[], selectionPath: number[]): Buffer[][] {
    return [];
}
