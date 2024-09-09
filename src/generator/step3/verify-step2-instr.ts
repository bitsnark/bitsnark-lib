import { getEncodingIndexForPat, ProtocolStep } from "./common";
import { _256To32BE, bufferToBigints256BE } from "../../encoding/encoding";
import { encodeWinternitz32 } from "../../encoding/winternitz";
import { ProgramLine } from "../common/saved-vm";
import { InstrCode } from "../step2/vm/types";
import { instrParamOptions } from "../step2/vm/types";
import { Bitcoin, SimulatedRegister } from "./bitcoin";
import { StackItem } from "./stack";

function encodeParam(n: bigint, chunkIndex: number) {
    return bufferToBigints256BE(encodeWinternitz32(n, 0)).map(_256To32BE).flat();
}

export function verifyStep2Instr(bitcoin: Bitcoin, instr: ProgramLine<InstrCode>, a: bigint, b: bigint, c: bigint) {

    const paramOptions = instrParamOptions[instr.name];
    const witnesses: StackItem[][] = [];
    [a, b, c].forEach((v, i) => {
        if (!paramOptions[i]) return;
        const chunkIndex = getEncodingIndexForPat(ProtocolStep.TRANSITION, 0, i);
        witnesses[i] = encodeParam(a, chunkIndex).map(n => bitcoin.addWitness(n));
    });
    const regs: SimulatedRegister[] = [];
    [a, b, c].forEach((v, i) => {
        if (!paramOptions[i]) return;
        const sr = bitcoin.newSimulatedRegister(0n);
        bitcoin.nibblesToRegister32(sr, witnesses[i]);
        regs[i] = sr;
    });

    switch (instr.name) {
        case InstrCode.ADD:
            bitcoin.step2_add(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.ADDOF:
            bitcoin.step2_addOf(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.SUB:
            bitcoin.step2_sub(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.SUBOF:
            bitcoin.step2_subOf(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.MOV:
            bitcoin.step2_mov(regs[0], regs[2]);
            break;
        case InstrCode.EQUAL:
            bitcoin.step2_equal(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.ANDBIT:
            bitcoin.step2_andBit(regs[0], regs[1], instr.bit!, regs[2]);
            break;
        case InstrCode.ANDNOTBIT:
            bitcoin.step2_andNotBit(regs[0], regs[1], instr.bit!, regs[2]);
            break;
        case InstrCode.SHR:
            bitcoin.step2_shr(regs[0], instr.bit!, regs[2]);
            break;
        case InstrCode.ROTR:
            bitcoin.step2_rotr(regs[0], instr.bit!, regs[2]);
            break;
        case InstrCode.AND:
            bitcoin.step2_and(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.XOR:
            bitcoin.step2_xor(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.OR:
            bitcoin.step2_or(regs[0], regs[1], regs[2]);
            break;
        case InstrCode.NOT:
            bitcoin.step2_not(regs[0], regs[2]);
            break;
        case InstrCode.ASSERTONE:
            bitcoin.step2_assertOne(regs[0])
            break;
    }
}
