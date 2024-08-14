export enum OpcodeType {
    DATA = 'DATA',
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
    OP_EQUAL = 'OP_EQUAL',
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
    OP_NUMEQUALVERIFY = 'OP_NUMEQUALVERIFY',
    OP_TOALTSTACK = 'OP_TOALTSTACK',
    OP_FROMALTSTACK = 'OP_FROMALTSTACK',
    OP_SWAP = 'OP_SWAP',
    OP_3DUP = 'OP_3DUP',
    OP_TUCK = 'OP_TUCK',
    OP_2SWAP = 'OP_2SWAP',
    OP_2DUP = 'OP_2DUP',
    OP_NIP = 'OP_NIP',
    OP_ROT = 'OP_ROT',
    OP_SHA256 = 'OP_SHA256',
    OP_VERIFY = 'OP_VERIFY',
    OP_CHECKSEQUENCEVERIFY = 'OP_CHECKSEQUENCEVERIFY'
}

export function hardcode(value: bigint): OpcodeType {
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
    ][Number(value)];
}

export const opcodeValues = {
    [OpcodeType.OP_ROLL]: 122,
    [OpcodeType.OP_PICK]: 121,
        [OpcodeType.OP_DROP]: 117,
        [OpcodeType.OP_IF]: 99,
        [OpcodeType.OP_ENDIF]: 104,
        [OpcodeType.OP_ELSE]: 103,
        [OpcodeType.OP_ADD]: 147,
        [OpcodeType.OP_0]: 0,
        [OpcodeType.OP_1]: 81,
        [OpcodeType.OP_2]: 82,
        [OpcodeType.OP_3]: 83,
        [OpcodeType.OP_4]: 84,
        [OpcodeType.OP_5]: 85,
        [OpcodeType.OP_6]: 86, 
        [OpcodeType.OP_7]: 87, 
        [OpcodeType.OP_8]: 88,
        [OpcodeType.OP_9]: 89,
        [OpcodeType.OP_10]: 90,
        [OpcodeType.OP_11]: 91,
        [OpcodeType.OP_12]: 92,
        [OpcodeType.OP_13]: 93, 
        [OpcodeType.OP_14]: 94,
        [OpcodeType.OP_15]: 95,
        [OpcodeType.OP_16]: 96,
        [OpcodeType.OP_NUMEQUAL]: 156,
        [OpcodeType.OP_NOT]: 145,
        [OpcodeType.OP_EQUAL]: 135,
        [OpcodeType.OP_EQUALVERIFY]: 157,
        [OpcodeType.OP_GREATERTHAN]: 160,
        [OpcodeType.OP_GREATERTHANOREQUAL]: 162,
        [OpcodeType.OP_SUB]: 148,
        [OpcodeType.OP_DUP]: 118,
        [OpcodeType.OP_LESSTHAN]: 159,
        [OpcodeType.OP_LESSTHANOREQUAL]: 162,
        [OpcodeType.OP_BOOLAND]: 154,
        [OpcodeType.OP_BOOLOR]: 155,
        [OpcodeType.OP_WITHIN]: 165,
        [OpcodeType.OP_NUMEQUALVERIFY]: 157,
        [OpcodeType.OP_TOALTSTACK]: 107,
        [OpcodeType.OP_FROMALTSTACK]: 108,
        [OpcodeType.OP_SWAP]: 124,
        [OpcodeType.OP_3DUP]: 111,
        [OpcodeType.OP_TUCK]: 125,
        [OpcodeType.OP_2SWAP]: 114,
        [OpcodeType.OP_2DUP]: 110,
        [OpcodeType.OP_NIP]: 119,
        [OpcodeType.OP_ROT]: 123,
        [OpcodeType.OP_SHA256]: 168,
        [OpcodeType.OP_VERIFY]: 105,
        [OpcodeType.OP_CHECKSEQUENCEVERIFY]: 178
};