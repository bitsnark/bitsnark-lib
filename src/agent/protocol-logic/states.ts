import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { step1_vm } from '../../generator/step1/vm/vm';
import { Decasector } from '../final-step/decasector';
import { vKey } from '../../generator/step1/constants';
import { Runner } from '../../generator/step1/vm/runner';
import { FatMerkleProof } from './fat-merkle';
import { encodeWinternitz256 } from '../winternitz';

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

    return states.map(s => encodeWinternitz256)
}

export async function findErrorState(proof: bigint[], states: Buffer[], selectionPath: number[]): Promise<number> {
    const myStates = await calculateStates(proof, selectionPath);
    return myStates.findIndex((b, i) => b.compare(states[i]) != 0);
}

export function makeArgument(proof: bigint[], selectionPath: number[]): Buffer[][] {
    return [];
}
