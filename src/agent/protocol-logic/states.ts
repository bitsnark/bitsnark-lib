import { AgentRoles } from '../common/types';
import { Decasector } from '../setup/decasector';
import { FatMerkleProof } from './fat-merkle';

export async function calculateStates(role: AgentRoles, proof: bigint[], selectionPath: number[]): Promise<Buffer[]> {
    const decasector = new Decasector(proof);
    const lines = decasector.getLinesForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const line of lines) {
        let regs;
        if (role == AgentRoles.PROVER && line >= decasector.total - 1) {
            regs = decasector.getRegsForSuccess();
        } else {
            regs = decasector.stateCommitmentByLine[line].getValues();
        }
        const root = await FatMerkleProof.calculateRoot(regs);
        states.push(root);
    }
    return states;
}

export async function findErrorState(proof: bigint[], states: Buffer[], selectionPath: number[]): Promise<number> {
    const myStates = await calculateStates(AgentRoles.VERIFIER, proof, selectionPath);
    const t = myStates.findIndex((b, i) => b.compare(states[i]) != 0);
    return t >= 0 ? t : states.length;
}
