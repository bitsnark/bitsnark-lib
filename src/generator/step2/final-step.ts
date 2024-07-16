import { Register } from "../common/register";
import { step2_vm, step2_vm as vm } from "./vm/vm";
import { ProgramLine, SavedVm } from '../common/saved-vm';
import { InstrCode as Step1_InstrCode } from '../step1/vm/types';
import { _256, InstrCode as Step2_InstrCode } from '../step2/vm/types';
import { _256To32LE } from "../../encoding/encoding";

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

