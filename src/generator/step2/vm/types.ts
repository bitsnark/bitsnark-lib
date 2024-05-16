export enum InstrCode {
    DATA = 'DATA',
    ADD = 'ADD',
    AND = 'AND',
    XOR = 'XOR',
    NOT = 'NOT',
    SHR = 'SHR',
    ROTR = 'ROTR',
    MOV = 'MOV',
    ASSERTEQ = 'ASSERTEQ'
}

export interface Instruction {
    name: InstrCode;
    target: number;
    params: number[];
    data?: bigint;
}
