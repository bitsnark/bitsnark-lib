import { Register } from "../../common/register";

export enum InstrCode {
    ADD = 'ADD',
    ADDOF = 'ADDOF',
    SUB = 'SUB',
    SUBOF = 'SUBOF',
    MOV = 'MOV',
    EQUAL = 'EQUAL',
    ANDBIT = 'ANDBIT',
    ANDNOTBIT = 'ANDNOTBIT',
    SHR = 'SHR',
    ROTR = 'ROTR',
    AND = 'AND',
    XOR = 'XOR',
    OR = 'OR',
    NOT = 'NOT',
    ASSERTONE = 'ASSERTONE'
}

export const instrParamOptions = {
    [InstrCode.ADD]: [ true, true, true ],
    [InstrCode.ADDOF]: [ true, true, true ],
    [InstrCode.SUB]: [ true, true, true ],
    [InstrCode.SUBOF]: [ true, true, true ],
    [InstrCode.MOV]: [ true, false, true ],
    [InstrCode.EQUAL]: [ true, true, true ],
    [InstrCode.ANDBIT]: [ true, true, true ],
    [InstrCode.ANDNOTBIT]: [ true, true, true ],
    [InstrCode.SHR]: [ true, false, true ],
    [InstrCode.ROTR]: [ true, false, true ],
    [InstrCode.AND]: [ true, true, true ],
    [InstrCode.XOR]: [ true, true, true ],
    [InstrCode.OR]: [ true, true, true ],
    [InstrCode.NOT]: [ true, false, true ],
    [InstrCode.ASSERTONE]: [ true, false, true ],
};

export interface Instruction {
    name: InstrCode;
    target: number;
    param1?: number;
    param2?: number;
    bit?: number;
}

export type _256 = Register[];