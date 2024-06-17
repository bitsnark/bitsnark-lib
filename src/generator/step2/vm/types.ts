import { Register } from "../../common/register";

export enum InstrCode {
    ADD = 'ADD',
    ADDOF = 'ADDOF',
    SUB = 'SUB',
    SUBOF = 'SUBOF',

    MOV = 'MOV',
    GT = 'GT',
    EQUAL = 'EQUAL',

    ANDBIT = 'ANDBIT',
    ANDNOTBIT = 'ANDNOTBIT',

    SHR = 'SHR',
    ROTR = 'ROTR',
    AND = 'AND',
    XOR = 'XOR',
    OR = 'OR',
    NOT = 'NOT',

    ASSERTEQ = 'ASSERTEQ'
}

export interface Instruction {
    name: InstrCode;
    target: number;
    param1?: number;
    param2?: number;
    data?: number;
}

export type _256 = Register[];