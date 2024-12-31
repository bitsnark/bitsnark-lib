import { proofBigint } from '../common/constants';
import { Decasector } from '../setup/decasector';
import { FatMerkleProof } from './fat-merkle';

export async function calculateStates(
    proof: bigint[],
    selectionPath: number[],
    forceSuccess: boolean
): Promise<Buffer[]> {
    const decasector = new Decasector(proof);
    const lines = decasector.getLinesForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const line of lines) {
        const regs = decasector.stateCommitmentByLine[line].getValues();
        const root = await FatMerkleProof.calculateRoot(regs);
        states.push(root);
    }
    if (forceSuccess) {
        const regsForSuccess = decasector.getRegsForSuccess();
        const root = await FatMerkleProof.calculateRoot(regsForSuccess);
        states[states.length - 1] = root;
    }
    return states;
}

export async function findErrorState(proof: bigint[], states: Buffer[], selectionPath: number[]): Promise<number> {
    const myStates = await calculateStates(proof, selectionPath, false);
    const t = myStates.findIndex((b, i) => b.compare(states[i]) != 0);
    return t >= 0 ? t : states.length;
}
