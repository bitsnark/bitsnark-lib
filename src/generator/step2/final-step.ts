import fs from 'fs';
import { Register } from "../common/register";
import { vm } from "./vm/vm";
import { ProgramLine, SavedVm } from '../common/saved-vm';
import { InstrCode } from '../step2/vm/types';

type _256 = Register[];

export class Proof {
    rootBefore: _256 = [];
    rootAfter: _256 = [];
    reg256A: _256 = [];
    reg256B: _256 = [];
    reg256C: _256 = [];
    merkleProofA: _256[] = [];
    merkleProofB: _256[] = [];
    merkleProofC: _256[] = [];

    constructor(height: number, instrCode: InstrCode, _witness: bigint[]) {
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

function getStep1Instr(line: number): ProgramLine<InstrCode> {
    const path = './generated/snark.json';
    const obj = JSON.parse(fs.readFileSync(path).toString()) as SavedVm<InstrCode>;
    return obj.program[line];
}

function validateInstr(instr: ProgramLine<InstrCode>, a: _256, b: _256, c: _256) {
    switch (instr.name) {
        case InstrCode.ADDMOD:
            vm.addMod(a, b, c); break;
        case InstrCode.ANDBIT:
            vm.andBit(a, b, c); break;
        case InstrCode.ANDNOTBIT:
            vm.andNotBit(a, b, c); break;
        case InstrCode.MOV:
            vm.mov(a, b, c); break;
        case InstrCode.EQUAL:
            vm.equal(a, b, c); break;
        case InstrCode.MULMOD:
            vm.mulMod(a, b, c); break;
        case InstrCode.OR:
            vm.or(a, b, c); break;
        case InstrCode.AND:
            vm.and(a, b, c); break;
        case InstrCode.NOT:
            vm.not(a, b, c); break;
        case InstrCode.SUBMOD:
            vm.subMod(a, b, c); break;
        case InstrCode.DIVMOD:
            vm.divMod(a, b, c); break;
        case InstrCode.ASSERTONE:
            vm.assertEqOne(a, b, c); break;
        case InstrCode.ASSERTZERO:
            vm.assertEqZero(a, b, c); break;
    }
}

export default async function validate(line: number, proof: Proof) {

    const instr = getStep1Instr(line);

    verifyMerkleProof(proof.rootBefore, instr.param1!, proof.reg256A, proof.merkleProofA);
    verifyMerkleProof(proof.rootBefore, instr.param2!, proof.reg256B, proof.merkleProofB);
    verifyMerkleProof(proof.rootAfter, instr.target, proof.reg256C, proof.merkleProofC);

    validateInstr(instr, proof.reg256A, proof.reg256B, proof.reg256C);

    return vm.success;
}
