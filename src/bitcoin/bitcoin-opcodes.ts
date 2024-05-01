export enum OpcodeType {
    DATA = 'DATA',
    OP_PUSHDATA4 = 'OP_PUSHDATA4',
    OP_ROLL = 'OP_ROLL',
    OP_PICK = 'OP_PICK',
    OP_DROP = 'OP_DROP',
    OP_IF = 'OP_IF',
    OP_ENDIF = 'OP_ENDIF',
    OP_ELSE = 'OP_ELSE',
    OP_ADD = 'OP_ADD',
    OP_0 = 'OP_0',
    OP_1 = 'OP_1',
    OP_2 = 'OP_2',
    OP_3 = 'OP_3',
    OP_4 = 'OP_4',
    OP_5 = 'OP_5',
    OP_6 = 'OP_6',
    OP_7 = 'OP_7',
    OP_8 = 'OP_8',
    OP_9 = 'OP_9',
    OP_10 = 'OP_10',
    OP_11 = 'OP_11',
    OP_12 = 'OP_12',
    OP_13 = 'OP_13',
    OP_14 = 'OP_14',
    OP_15 = 'OP_15',
    OP_16 = 'OP_16',
    OP_NUMEQUAL = 'OP_NUMEQUAL',
    OP_NOT = 'OP_NOT',
    OP_EQUALVERIFY = 'OP_EQUALVERIFY',
    OP_GREATERTHAN = 'OP_GREATERTHAN',
    OP_GREATERTHANOREQUAL = 'OP_GREATERTHANOREQUAL',
    OP_SUB = 'OP_SUB',
    OP_DUP = 'OP_DUP',
    OP_LESSTHAN = 'OP_LESSTHAN',
    OP_LESSTHANOREQUAL = 'OP_LESSTHANOREQUAL',
    OP_BOOLAND = 'OP_BOOLAND',
    OP_BOOLOR = 'OP_BOOLOR',
    OP_WITHIN = 'OP_WITHIN',
    OP_NUMEQUALVERIFY = 'OP_NUMEQUALVERIFY'
}

export function hardcode(value: number): OpcodeType {
    if (value < 0 || value > 16) throw new Error('Invalid hardcoded value');
    return [
        OpcodeType.OP_0,
        OpcodeType.OP_1,
        OpcodeType.OP_2,
        OpcodeType.OP_3,
        OpcodeType.OP_4,
        OpcodeType.OP_5,
        OpcodeType.OP_6,
        OpcodeType.OP_7,
        OpcodeType.OP_8,
        OpcodeType.OP_9,
        OpcodeType.OP_10,
        OpcodeType.OP_11,
        OpcodeType.OP_12,
        OpcodeType.OP_13,
        OpcodeType.OP_14,
        OpcodeType.OP_15,
        OpcodeType.OP_16
    ][value];

}