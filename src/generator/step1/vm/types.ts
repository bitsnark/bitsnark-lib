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

export const instrParamOptions = {
    [InstrCode.ADDMOD]: [ true, true, true ],
    [InstrCode.ANDBIT]: [ true, true, true ],
    [InstrCode.ANDNOTBIT]: [ true, true, true ],
    [InstrCode.MOV]: [ true, false, true ],
    [InstrCode.EQUAL]: [ true, true, true ],
    [InstrCode.MULMOD]: [ true, true, true ],
    [InstrCode.OR]: [ true, true, true ],
    [InstrCode.AND]: [ true, true, true ],
    [InstrCode.NOT]: [ true, false, true ],
    [InstrCode.SUBMOD]: [ true, true, true ],
    [InstrCode.DIVMOD]: [ true, true, true ],
    [InstrCode.ASSERTONE]: [ true, false, true ],
    [InstrCode.ASSERTZERO]: [ true, false, true ],
};
