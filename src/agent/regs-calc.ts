import { proof, vKey } from '../generator/step1/constants';
import groth16Verify, { Key, Proof as Step1_Proof } from '../generator/step1/verifier';
import { step1_vm, VM as Step1_vm } from '../generator/step1/vm/vm';

export function getRegsAt(vm: Step1_vm, left: number, point: number, right: number): number[] {

    const map: any = {};
    for (let i = left; i <= point; i++) {
        if (!step1_vm.instructions[i]) break;
        const index = step1_vm.instructions[i].target;
        map[index] = true;
    }
    const regs: number[] = [];
    for (let i = point + 1; i <= right; i++) {
        if (step1_vm.instructions[i]?.param1 && map[step1_vm.instructions[i].param1]) {
            regs.push(step1_vm.instructions[i].param1);
            delete map[step1_vm.instructions[i].param1];
        }
        if (step1_vm.instructions[i]?.param2 && map[step1_vm.instructions[i].param2!]) {
            regs.push(step1_vm.instructions[i].param2!);
            delete map[step1_vm.instructions[i].param2!];
        }
    }
    return regs;
}

function getStateSizes(vm: Step1_vm, left: number, right: number, iteration: number, result: number[]) {

    if (left + 1 >= right) {
        return;
    }

    let middle = Math.round((left + right) / 2);
    result[iteration] = Math.max(
        result[iteration] ?? 0,
        getRegsAt(vm, left, middle, right).length);

    getStateSizes(vm, left, middle, iteration + 1, result);
    getStateSizes(vm, middle, right, iteration + 1, result);
}

function getLines(vm: Step1_vm, left: number, right: number, iteration: number, result: number[][][]) {

    if (left + 1 >= right) {
        return;
    }

    let middle = Math.round((left + right) / 2);
    result[iteration] = result[iteration] ?? [];
    result[iteration].push([left, middle, right]);

    getLines(vm, left, middle, iteration + 1, result);
    getLines(vm, middle, right, iteration + 1, result);
}


step1_vm.reset();
groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
if (!step1_vm.success?.value) throw new Error('Failed.');

const counts: number[] = [];
getStateSizes(step1_vm, 0, step1_vm.instructions.length - 1, 0, counts);
console.log(counts);

const lines: number[][][] = [];
getLines(step1_vm, 0, step1_vm.instructions.length - 1, 0, lines);
console.log(lines.length, lines[lines.length - 1]);
