import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import { Decasector } from '../final-step/decasector';
import { vKey } from '../../generator/ec_vm/constants';
import { Runner } from '../../generator/ec_vm/vm/runner';
import { FatMerkleProof } from './fat-merkle';
import { InstrCode } from '../../generator/ec_vm/vm/types';
import { SavedVm } from '../../generator/common/saved-vm';

interface RegsItem {
    runtimeIndex: number;
    value?: bigint;
}

export function getRegsAt(savedVm: SavedVm<InstrCode>, left: number, line: number, right: number): RegsItem[] {
    const runner = Runner.load(savedVm);
    const map: RegsItem[] = [];
    const flags: boolean[] = [];
    for (let i = left; i <= right; i++) {
        const instr = runner.instructions[i];
        if (!flags[instr.param1] && i >= line) {
            flags[instr.param1] = true;
            map.push({ runtimeIndex: instr.param1 });
        }
        if (instr.param2 && !flags[instr.param2] && i >= line) {
            flags[instr.param2] = true;
            map.push({ runtimeIndex: instr.param2 });
        }
        if (!flags[instr.target] && i <= line) {
            flags[instr.target] = true;
            map.push({ runtimeIndex: instr.target });
        }
    }
    runner.execute(line);
    const regs = runner.getRegisterValues();
    for (const rmi of map) {
        rmi.value = regs[rmi.runtimeIndex];
    }
    return map.sort((mi1, mi2) => mi1.runtimeIndex - mi2.runtimeIndex);
}

export async function calculateStates(proof: bigint[], selectionPath: number[]): Promise<Buffer[]> {
    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const savedVm = step1_vm.save();
    const decasector = new Decasector(savedVm.program.length);
    const { left, right } = decasector.getRangeForSelectionPath(selectionPath);
    const lines = decasector.getLinesForSelectionPath(selectionPath);
    const states: Buffer[] = [];
    for (const line of lines) {
        const regs = getRegsAt(savedVm, left, line, right);
        const root = await FatMerkleProof.calculateRoot(regs.map((ri) => ri.value!));
        states.push(root);
    }
    return states;
}

export async function findErrorState(proof: bigint[], states: Buffer[], selectionPath: number[]): Promise<number> {
    const myStates = await calculateStates(proof, selectionPath);
    return myStates.findIndex((b, i) => b.compare(states[i]) != 0);
}
