import { Bitcoin } from '../../../src/generator/btc_vm/bitcoin';
import { Instruction, InstrCode } from '../../../src/generator/ec_vm/vm/types';
import { StackItem } from '../../../src/generator/btc_vm/stack';
import { NegifyFinalStep } from './negify-final-step';

export function checkLineBitcoin(
    bitcoin: Bitcoin,
    line: Instruction,
    a: StackItem[],
    b: StackItem[],
    c: StackItem[],
    d?: StackItem[]
) {
    const negifier = new NegifyFinalStep(bitcoin);

    switch (line.name) {
        case InstrCode.ADDMOD:
            negifier.negifyAddMod(a, b, c);
            break;
        case InstrCode.ANDBIT:
            negifier.negifyAndBit(a, b, c, line.bit!);
            break;
        case InstrCode.ANDNOTBIT:
            negifier.negifyAndNotBit(a, b, c, line.bit!);
            break;
        case InstrCode.MOV:
            negifier.negifyMov(a, c);
            break;
        case InstrCode.EQUAL:
            negifier.negifyEqual(a, b, c);
            break;
        case InstrCode.MULMOD:
            negifier.negifyMulMod(a, b, c, d!);
            break;
        case InstrCode.OR:
            negifier.negifyOr(a, b, c);
            break;
        case InstrCode.AND:
            negifier.negifyAnd(a, b, c);
            break;
        case InstrCode.NOT:
            negifier.negifyNot(a, c);
            break;
        case InstrCode.SUBMOD:
            negifier.negifySubMod(a, b, c);
            break;
        case InstrCode.DIVMOD:
            negifier.negifyDivMod(a, b, c, d!);
            break;
        case InstrCode.ASSERTONE:
            negifier.negifyNumOne(a);
            break;
        case InstrCode.ASSERTZERO:
            negifier.negifyNumZero(a);
            break;
    }
}
