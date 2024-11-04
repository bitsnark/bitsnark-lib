import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { vKey } from "../../generator/step1/constants";
import { step1_vm } from "../../generator/step1/vm/vm";
import { InstrCode } from '../../generator/step1/vm/types';

// step1_vm.reset();
// groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
// // if (!step1_vm.success?.value) throw new Error('Failed.');
// const program = step1_vm.instructions;
// let stats: any = {};
// for (let i = 0; i < program.length; i++) {
//     stats[program[i].name] = (stats[program[i].name] ?? 0) + 1;
// }
// console.log(stats);

function makeTree() {
    const ar: string[] = [];
    for (let i = 0; i < 64; i++) {
        ar.push(''+i);
    }
    let tar = ar;
    let tree: string[][] = [ ar ];
    while (tar.length > 1) {
        const ttt: string[] = [];
        for (let i = 0; i < tar.length;) {
            ttt.push(`(${tar[i++]}|${tar[i++]})`);
        }
        tree.push(ttt);
        tar = ttt;
    }
    return tree;
}

function makeProof(tree: string[][], index: number) {
    const proof: string[] = [];
    for(let line = 0; line < tree.length; line++) {
        proof.push(tree[line][index]);
        if ((index & 1) == 0) proof.push(tree[line][index + 1]);
        else proof.push(tree[line][index - 1]);
        index = Math.floor(index / 2);
    }
    return proof;
}

const tree = makeTree();
const proof = makeProof(tree, 7);
console.log(proof);