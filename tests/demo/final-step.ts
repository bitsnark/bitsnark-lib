import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { SavedVm } from '../../src/generator/common/saved-vm';
import { InstrCode } from '../../src/generator/step2/vm/types';
import { Runner } from '../../src/generator/step2/vm/runner';

export function finalStep(savedProgram: SavedVm<InstrCode>, line: number, a: bigint, b: bigint, c: bigint) {

    const bitcoin = new Bitcoin();
    const runner = Runner.load(savedProgram);
    const instr = runner.getInstruction(line);

    const aReg = bitcoin.newSimulatedRegister(a);
    const bReg = bitcoin.newSimulatedRegister(b);
    const cReg = bitcoin.newSimulatedRegister(c);

    switch (instr.name) {
        case InstrCode.ADD:
            bitcoin.step2_add(aReg, bReg, cReg);
            break;
        case InstrCode.ADDOF:
            bitcoin.step2_addOf(aReg, bReg, cReg);
            break;
        case InstrCode.SUB:
            bitcoin.step2_sub(aReg, bReg, cReg);
            break;
        case InstrCode.SUBOF:
            bitcoin.step2_subOf(aReg, bReg, cReg);
            break;
        case InstrCode.MOV:
            bitcoin.step2_mov(aReg, cReg);
            break;
        case InstrCode.EQUAL:
            bitcoin.step2_equal(aReg, bReg, cReg);
            break;
        case InstrCode.ANDBIT:
            bitcoin.step2_andBit(aReg, bReg, instr.bit ?? 0, cReg);
            break;
        case InstrCode.ANDNOTBIT:
            bitcoin.step2_andNotBit(aReg, bReg, instr.bit ?? 0, cReg);
            break;
        case InstrCode.SHR:
            bitcoin.step2_shr(aReg, instr.bit ?? 0, cReg);
            break;
        case InstrCode.ROTR:
            bitcoin.step2_rotr(aReg, instr.bit ?? 0, cReg);
            break;
        case InstrCode.AND:
            bitcoin.step2_and(aReg, bReg, cReg);
            break;
        case InstrCode.XOR:
            bitcoin.step2_xor(aReg, bReg, cReg);
            break;
        case InstrCode.OR:
            bitcoin.step2_or(aReg, bReg, cReg);
            break;
        case InstrCode.NOT:
            bitcoin.step2_not(aReg, cReg);
            break;
        case InstrCode.ASSERTONE:
            bitcoin.step2_assertOne(aReg);
            break;
    }

    console.log('********************************************************************************')
    console.log(`Final step (PAT):`);
    console.log('SUCCESS: ', bitcoin.success);
    console.log('data size: ', 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    // console.log('witness: ', witness);
    //console.log('program: ', bitcoin.programToString());
}