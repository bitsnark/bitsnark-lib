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
    DIVMOD,
    ASSERTONE,
    ASSERTZERO
}

export interface Instruction {
    name: InstrCode;
    target: number;
    param1?: number;
    param2?: number;
    data?: bigint;
}
