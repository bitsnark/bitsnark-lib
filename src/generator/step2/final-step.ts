import { Register } from "../common/register";
import { step2_vm as vm } from "./vm/vm";
import { ProgramLine, SavedVm } from '../common/saved-vm';
import { InstrCode as Step1_InstrCode } from '../step1/vm/types';
import { _256, InstrCode as Step2_InstrCode } from '../step2/vm/types';
import { Merkle, MerkleProve } from './merkle'

export class Proof {
    reg256A: _256 = [];
    reg256B: _256 = [];
    reg256C: _256 = [];
    merkleRoots: _256[] = []
    merkleProofs: _256[][] = [];
    merkle: Merkle | undefined

    makeMerkle(registers: bigint[]) {
        let transactions: Register[][] = []
        for (let i = 0; i < registers.length; i++) {
            let transaction = vm.newTemp256(true)
            let value = registers[i]
            for (let j = 0; j < 8; j++) {
                vm.setRegister(transaction[j], value & 0xffffffffn)
                value = value >> 32n
            }
            transactions.push(transaction)
        }
        this.merkle = new Merkle(transactions)
        this.merkleRoots.push(this.merkle.GetRoot())
        for (let i = 0; i < transactions.length; i++) {
            vm.freeTemp256(transactions[i])
        }
    }

    makeMerkleProof(index: number) {
        if (this.merkle !== undefined) {
            this.merkleProofs.push(this.merkle.GetProof(index))
        }
    }

    freeMerkle() {
        if (this.merkle !== undefined) {
            this.merkle.Free()
        }
    }
}

function verifyMerkleProof(root: _256, regIndex: number, regValue: _256, mp: _256[]) {
    MerkleProve(regIndex, regValue, mp, root)
}

export function validateInstr(proof: Proof, instr: ProgramLine<Step1_InstrCode>) {
    const a = proof.reg256A;
    const b = proof.reg256B;
    const c = proof.reg256C;

    switch (instr.name) {
        case Step1_InstrCode.ADDMOD:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_addMod(a, b, c); break;
        case Step1_InstrCode.ANDBIT:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_andBit(a, instr.bit!, b, c); break;
        case Step1_InstrCode.ANDNOTBIT:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_andNotBit(a, instr.bit!, b, c); break;
        case Step1_InstrCode.MOV:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_mov(a, c); break;
        case Step1_InstrCode.EQUAL:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_equal(a, b, c); break;
        case Step1_InstrCode.MULMOD:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_mulMod(a, b, c); break;
        case Step1_InstrCode.OR:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_or(a, b, c); break;
        case Step1_InstrCode.AND:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_and(a, b, c); break;
        case Step1_InstrCode.NOT:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_not(a, c); break;
        case Step1_InstrCode.SUBMOD:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_subMod(a, b, c); break;
        case Step1_InstrCode.DIVMOD:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            verifyMerkleProof(proof.merkleRoots[0], instr.param2!, proof.reg256B, proof.merkleProofs[1]);
            verifyMerkleProof(proof.merkleRoots[1], instr.target, proof.reg256C, proof.merkleProofs[2]);        
            vm.step1_divMod(a, b, c); break;
        case Step1_InstrCode.ASSERTONE:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            vm.step1_assertEqOne(a); break;
        case Step1_InstrCode.ASSERTZERO:
            verifyMerkleProof(proof.merkleRoots[0], instr.param1!, proof.reg256A, proof.merkleProofs[0]);
            vm.step1_assertEqZero(a); break;
    }
}
