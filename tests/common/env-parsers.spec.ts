import { describe, expect, it } from "@jest/globals";

import { parseEnv, ParsedType } from '../../src/common/env-parser';

describe('parseEnv', () => {
    
    const env = {
        'INTEGER': '42',
        'FLOAT': '3.14',
        'BIGINT': '12345678901234567890',
        'BOOLEAN_TRUE': 'true',
        'BOOLEAN_FALSE': 'false',
        'BOOLEAN_ONE': '1',
        'BOOLEAN_ZERO': '0',
        'BOOLEAN_YES': 'yes',
        'BOOLEAN_NO': 'no',
        'BOOLEAN_ON': 'on',
        'BOOLEAN_OFF': 'off',
        'BOOLEAN_Y': 'y',
        'BOOLEAN_N': 'n',
        'BOOLEAN_INVALID': 'invalid',
    };

    it('should parse an integer', () => {
        expect(parseEnv(env, 'INTEGER', ParsedType.INTEGER, 0)).toEqual(42);
        expect(parseEnv(env, 'INTEGER_NONEXISTING', ParsedType.INTEGER, 0)).toEqual(0);
    });

    it('should throw an error for an invalid integer', () => {
        expect(() => parseEnv(env, 'FLOAT', ParsedType.INTEGER, 0)).toThrow('Invalid value: FLOAT: 3.14');
    });

    it('should parse a bigint', () => {
        expect(parseEnv(env, 'BIGINT', ParsedType.BIGINT, 0n)).toEqual(12345678901234567890n);
        expect(parseEnv(env, 'BIGINT_NONEXISTING', ParsedType.BIGINT, 0n)).toEqual(0n);
    });

    it('should throw an error for an invalid bigint', () => {
        expect(() => parseEnv(env, 'FLOAT', ParsedType.BIGINT, 0n)).toThrow('Invalid value: FLOAT: 3.14');
    });

    it('should parse a boolean', () => {
        expect(parseEnv(env, 'BOOLEAN_TRUE', ParsedType.BOOLEAN, false)).toEqual(true);
        expect(parseEnv(env, 'BOOLEAN_FALSE', ParsedType.BOOLEAN, true)).toEqual(false);
        expect(parseEnv(env, 'BOOLEAN_ONE', ParsedType.BOOLEAN, false)).toEqual(true);
        expect(parseEnv(env, 'BOOLEAN_ZERO', ParsedType.BOOLEAN, true)).toEqual(false);
        expect(parseEnv(env, 'BOOLEAN_YES', ParsedType.BOOLEAN, false)).toEqual(true);
        expect(parseEnv(env, 'BOOLEAN_NO', ParsedType.BOOLEAN, true)).toEqual(false);
        expect(parseEnv(env, 'BOOLEAN_ON', ParsedType.BOOLEAN, false)).toEqual(true);
        expect(parseEnv(env, 'BOOLEAN_OFF', ParsedType.BOOLEAN, true)).toEqual(false);
        expect(parseEnv(env, 'BOOLEAN_Y', ParsedType.BOOLEAN, false)).toEqual(true);
        expect(parseEnv(env, 'BOOLEAN_N', ParsedType.BOOLEAN, true)).toEqual(false);
        expect(parseEnv(env, 'BOOLEAN_NONEXISTING', ParsedType.BOOLEAN, false)).toEqual(false);
    });

    it('should throw an error for an invalid boolean', () => {
        expect(() => parseEnv(env, 'BOOLEAN_INVALID', ParsedType.BOOLEAN, false)).toThrow('Invalid value: BOOLEAN_INVALID: invalid');
    });

    it('should throw an error for an unsupported type', () => {
        expect(() => parseEnv(env, 'INTEGER', 'unsupported', 0)).toThrow('Unsupported type: unsupported');
    });

});
