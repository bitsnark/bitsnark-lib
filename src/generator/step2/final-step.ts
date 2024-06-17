import fs from 'fs';
import { Register } from "../common/register";
import { vm } from "./vm/vm";
import { ProgramLine, SavedVm } from '../common/saved-vm';
import { InstrCode as Step1_InstrCode } from '../step1/vm/types';
import { _256, InstrCode as Step2_InstrCode } from '../step2/vm/types';

export class Proof {
    rootBefore: _256 = [];
    rootAfter: _256 = [];
    reg256A: _256 = [];
    reg256B: _256 = [];
    reg256C: _256 = [];
    merkleProofA: _256[] = [];
    merkleProofB: _256[] = [];
    merkleProofC: _256[] = [];

    constructor(height: number, _witness: bigint[]) {
        let index = 0;
        function hashFromWitness(): _256 {
            const h: Register[] = [];
            for (let i = 0; i < 32; i++) {
                h.push(vm.addWitness(_witness[index++]));
            }
            return h;
        }
        function merkleProofFromWitness(): _256[] {
            const mp: _256[] = [];
            for (let i = 0; i < height - 1; i++) {
                mp.push(hashFromWitness());
            }
            return mp;
        }
        this.rootBefore = hashFromWitness();
        this.rootAfter = hashFromWitness();
        this.reg256A = hashFromWitness();
        this.reg256B = hashFromWitness();
        this.reg256C = hashFromWitness();
        this.merkleProofA = merkleProofFromWitness();
        this.merkleProofB = merkleProofFromWitness();
        this.merkleProofC = merkleProofFromWitness();
    }
}

function verifyMerkleProof(root: _256, regIndex: number, regValue: _256, mp: _256[]) {

}

function getStep1Instr(line: number): ProgramLine<Step1_InstrCode> {
    const path = './generated/snark.json';
    const obj = JSON.parse(fs.readFileSync(path).toString()) as SavedVm<Step1_InstrCode>;
    return obj.program[line];
}

function validateInstr(proof: Proof, instr: ProgramLine<Step1_InstrCode>) {
    const a = proof.reg256A;
    const b = proof.reg256B;
    const c = proof.reg256C;

    switch (instr.name) {
        case Step1_InstrCode.ADDMOD:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_addMod(a, b, c); break;
        case Step1_InstrCode.ANDBIT:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_andBit(a, Number(instr.data), b, c); break;
        case Step1_InstrCode.ANDNOTBIT:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_andNotBit(a, Number(instr.data), b, c); break;
        case Step1_InstrCode.MOV:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_mov(a, c); break;
        case Step1_InstrCode.EQUAL:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_equal(a, b, c); break;
        case Step1_InstrCode.MULMOD:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_mulMod(a, b, c); break;
        case Step1_InstrCode.OR:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_or(a, b, c); break;
        case Step1_InstrCode.AND:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_and(a, b, c); break;
        case Step1_InstrCode.NOT:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_not(a, c); break;
        case Step1_InstrCode.SUBMOD:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_subMod(a, b, c); break;
        case Step1_InstrCode.DIVMOD:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
            verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);        
            vm.step1_divMod(a, b, c); break;
        case Step1_InstrCode.ASSERTONE:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            vm.step1_assertEqOne(a); break;
        case Step1_InstrCode.ASSERTZERO:
            verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
            vm.step1_assertEqZero(a); break;
    }
}

export default async function validate(line: number, proof: Proof) {

    const instr = getStep1Instr(line);
    validateInstr(proof, instr);
    return vm.success;
}
