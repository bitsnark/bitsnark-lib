export enum InstrCode {
    ADDMOD = 'ADDMOD',
    ANDBIT = 'ANDBIT',
    ANDNOTBIT = 'ANDNOTBIT',
    MOV = 'MOV',
    EQUAL = 'EQUAL',
    MULMOD = 'MULMOD',
    OR = 'OR',
    AND = 'AND',
    NOT = 'NOT',
    SUBMOD = 'SUBMOD',
    DIVMOD = 'DIVMOD',
    ASSERTONE = 'ASSERTONE',
    ASSERTZERO = 'ASSERTZERO',
}

export interface Instruction {
    name: InstrCode;
    target: number;
    param1: number;
    param2?: number;
    bit?: number;
}
