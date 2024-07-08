import { InstrCode, instrParamOptions } from "../../src/generator/step2/vm/types";
import { Bitcoin } from "../../src/generator/step3/bitcoin";
import { StackItem } from "../../src/generator/step3/stack";
import { bufferToBigints256, encodeWinternitz, winternitzKeys } from "../encoding";

const param1 = 11293128n;
const param2 = 2210934110n;
const target = 1n;
const instrCode: InstrCode = InstrCode.ASSERTEQ;

function newNibbles(bitcoin: Bitcoin): StackItem[] {
    const nn: StackItem[] = [];
    for (let i = 0; i < 11; i++) {
        nn.push(bitcoin.newStackItem(0n));
    }
    return nn;
}

export function final(searchPath: boolean[], param1: bigint, param2: bigint, target: bigint, instrCode: InstrCode) {

    const bitcoin = new Bitcoin();
    const paramOptions = instrParamOptions[instrCode];
    let w1, w2, wt;
    let witnessWNZ1, witnessWNZ2, witnessWNZt;
    let nibbles1, nibbles2, nibblest;
    if (paramOptions[0]) {
        witnessWNZ1 = bufferToBigints256(encodeWinternitz(param1, 0, 32, 9)).map(n => bitcoin.addWitness(n));
    }
    if (paramOptions[1]) {
        witnessWNZ2 = bufferToBigints256(encodeWinternitz(param2, 0, 32, 9)).map(n => bitcoin.addWitness(n));
    }
    if (paramOptions[2]) {
        witnessWNZt = bufferToBigints256(encodeWinternitz(target, 0, 32, 9)).map(n => bitcoin.addWitness(n));
    }
    if (paramOptions[0]) {
        nibbles1 = newNibbles(bitcoin);
        bitcoin.winternitzDecode32(nibbles1, witnessWNZ1!, winternitzKeys.map(k => k.pblc));
    }
    if (paramOptions[1]) {
        nibbles2 = newNibbles(bitcoin);
        bitcoin.winternitzDecode32(nibbles2, witnessWNZ2!, winternitzKeys.map(k => k.pblc));
    }
    if (paramOptions[2]) {
        nibblest = newNibbles(bitcoin);
        bitcoin.winternitzDecode32(nibblest, witnessWNZt!, winternitzKeys.map(k => k.pblc));
    }

    switch (instrCode) {
        case InstrCode.ADD:
            bitcoin.step2_add(w1, w2, wt);
            break;
        case InstrCode.ADDOF:
            break;
        case InstrCode.SUB:
            break;
        case InstrCode.SUBOF:
            break;
        case InstrCode.MOV:
            break;
        case InstrCode.EQUAL:
            break;
        case InstrCode.ANDBIT:
            break;
        case InstrCode.ANDNOTBIT:
            break;
        case InstrCode.SHR:
            break;
        case InstrCode.ROTR:
            break;
        case InstrCode.AND:
            break;
        case InstrCode.XOR:
            break;
        case InstrCode.OR:
            break;
        case InstrCode.NOT:
            break;
        case InstrCode.ASSERTEQ:
            break;

    }



}