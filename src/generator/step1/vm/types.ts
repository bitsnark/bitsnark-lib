import { Register } from "../../common/register";

export enum InstrCode {
    ADDMOD,
    ANDBIT,
    ANDNOTBIT,
    MOV,
    EQUAL,
    MULMOD,
    OR,
    AND,
    NOT,
    SUB,
    SUBMOD,
    DIVMOD
}

export interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
    data?: bigint;
}
