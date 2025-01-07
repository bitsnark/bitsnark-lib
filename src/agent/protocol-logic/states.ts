import { last } from '../common/array-utils';
import { AgentRoles } from '../common/types';
import { Decasector } from '../setup/decasector';
import { FatMerkleProof } from './fat-merkle';

export async function calculateStates(role: AgentRoles, proof: bigint[], selectionPath: number[]): Promise<Buffer[]> {
    const decasector = new Decasector(proof);
    const lines = decasector.getLinesForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const line of lines) {
        let regs;
        if (role == AgentRoles.PROVER && line >= 400000) {
            regs = decasector.getRegsForSuccess();
        } else {
            regs = decasector.stateCommitmentByLine[line].getValues();
        }
        const root = await FatMerkleProof.calculateRoot(regs);
        states.push(root);
    }
    return states;
}

export async function calculateAggregateStates(role: AgentRoles, proof: bigint[], selectionPath: number[]): Promise<Buffer[][]> {
    const aggStates: Buffer[][] = [];
    for (let i = 0; i < selectionPath.length + 1; i++) {
        aggStates.push(await calculateStates(role, proof, selectionPath.slice(0, i)));
    }
    return aggStates;
}

export async function findErrorState(proof: bigint[], hisAggStates: Buffer[][], selectionPath: number[]): Promise<number> {
    const myAggStates = await calculateAggregateStates(AgentRoles.VERIFIER, proof, selectionPath);
    const myStates = last(myAggStates);
    const hisStates = last(hisAggStates);
    const t = myStates.findIndex((b, i) => b.compare(hisStates[i]) != 0);
    return t >= 0 ? t : myStates.length;
}
