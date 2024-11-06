import { describe, expect, it } from "@jest/globals";

import { EnvParser } from '../../src/common/env-parser';

describe('EnvParser', () => {
    
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

    const parser = new EnvParser(env);

    it('should parse an integer', () => {
        expect(parser.parseInteger('INTEGER', 0)).toEqual(42);
        expect(parser.parseInteger('INTEGER_NONEXISTING', 0)).toEqual(0);
    });

    it('should throw an error for an invalid integer', () => {
        expect(() => parser.parseInteger('FLOAT', 0)).toThrow('Value should be integer: FLOAT: 3.14');
    });

    it('should parse a bigint', () => {
        expect(parser.parseBigInt('BIGINT', 0n)).toEqual(12345678901234567890n);
        expect(parser.parseBigInt('BIGINT_NONEXISTING', 0n)).toEqual(0n);
    });

    it('should throw an error for an invalid bigint', () => {
        expect(() => parser.parseBigInt('FLOAT', 0n)).toThrow('Value should be bigint: FLOAT: 3.14');
    });

    it('should parse a boolean', () => {
        expect(parser.parseBoolean('BOOLEAN_TRUE')).toEqual(true);
        expect(parser.parseBoolean('BOOLEAN_FALSE')).toEqual(false);
        expect(parser.parseBoolean('BOOLEAN_ONE')).toEqual(true);
        expect(parser.parseBoolean('BOOLEAN_ZERO')).toEqual(false);
        expect(parser.parseBoolean('BOOLEAN_YES')).toEqual(true);
        expect(parser.parseBoolean('BOOLEAN_NO')).toEqual(false);
        expect(parser.parseBoolean('BOOLEAN_ON')).toEqual(true);
        expect(parser.parseBoolean('BOOLEAN_OFF')).toEqual(false);
        expect(parser.parseBoolean('BOOLEAN_Y')).toEqual(true);
        expect(parser.parseBoolean('BOOLEAN_N')).toEqual(false);
        expect(parser.parseBoolean('BOOLEAN_NONEXISTING')).toEqual(false);
    });

    it('should throw an error for an invalid boolean', () => {
        expect(() => parser.parseBoolean('BOOLEAN_INVALID', false)).toThrow('Value should be boolean: BOOLEAN_INVALID: invalid');
    });

});
