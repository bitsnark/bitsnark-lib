import { Register } from "../common/register";
import { step2_vm, step2_vm as vm } from "./vm/vm";
import { ProgramLine, SavedVm } from '../common/saved-vm';
import { InstrCode as Step1_InstrCode } from '../step1/vm/types';
import { _256, InstrCode as Step2_InstrCode } from '../step2/vm/types';
import { Merkle, MerkleProve } from './merkle'
import { _256To32LE } from "../../encoding/encoding";

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

export function validateInstr(a: bigint, b: bigint, c: bigint, name: Step1_InstrCode, bit?: number) {

    const aRegs = _256To32LE(a).map(n => vm.addWitness(n));
    const bRegs = _256To32LE(b).map(n => vm.addWitness(n));
    const cRegs = _256To32LE(c).map(n => vm.addWitness(n));

    step2_vm.startProgram();

    switch (name) {
        case Step1_InstrCode.ADDMOD:
            vm.step1_addMod(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.ANDBIT:
            vm.step1_andBit(aRegs, bit!, bRegs, cRegs); break;
        case Step1_InstrCode.ANDNOTBIT:
            vm.step1_andNotBit(aRegs, bit!, bRegs, cRegs); break;
        case Step1_InstrCode.MOV:
            vm.step1_mov(aRegs, cRegs); break;
        case Step1_InstrCode.EQUAL:
            vm.step1_equal(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.MULMOD:
            vm.step1_mulMod(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.OR:
            vm.step1_or(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.AND:
            vm.step1_and(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.NOT:
            vm.step1_not(aRegs, cRegs); break;
        case Step1_InstrCode.SUBMOD:
            vm.step1_subMod(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.DIVMOD:
            vm.step1_divMod(aRegs, bRegs, cRegs); break;
        case Step1_InstrCode.ASSERTONE:
            vm.step1_assertEqOne(aRegs); break;
        case Step1_InstrCode.ASSERTZERO:
            vm.step1_assertEqZero(aRegs); break;
    }
}

