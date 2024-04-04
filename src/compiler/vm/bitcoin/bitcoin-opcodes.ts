export enum OpcodeType {
    DATA = 'DATA',
    OP_ROLL = 'OP_ROLL',
    OP_PICK = 'OP_PICK',
    OP_DROP = 'OP_DROP',
    OP_AND = 'OP_AND',
    OP_IF = 'OP_IF',
    OP_0 = 'OP_0',
    OP_1 = 'OP_1',
    OP_2 = 'OP_2',
    OP_EQUAL = 'OP_EQUAL',
    OP_ENDIF = 'OP_ENDIF',
    OP_ELSE = 'OP_ELSE',
    OP_OR = 'OP_OR',
    OP_NOT = 'OP_NOT',
    OP_EQUALVERIFY = 'OP_EQUALVERIFY'
}

export const sideEffects = {
    [OpcodeType.DATA]: 1,
    [OpcodeType.OP_ROLL]: -1,
    [OpcodeType.OP_PICK]: -1,
    [OpcodeType.OP_DROP]: -1,
    [OpcodeType.OP_AND]: -1,
    [OpcodeType.OP_IF]: -1,
    [OpcodeType.OP_0]: 1,
    [OpcodeType.OP_1]: 1,
    [OpcodeType.OP_2]: 1,
    [OpcodeType.OP_EQUAL]: -1,
    [OpcodeType.OP_ENDIF]: 0,
    [OpcodeType.OP_ELSE]: 0,
    [OpcodeType.OP_OR]: -1,
    [OpcodeType.OP_NOT]: 0,
    [OpcodeType.OP_EQUALVERIFY]: -2
};
