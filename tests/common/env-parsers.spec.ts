import { describe, expect, it } from "@jest/globals";
import { parse } from '../../src/common/env-parser';

describe('parseEnv', () => {

    const envVarName = 'TEST';

    it('parse a string', () => {
        const value = 'test';
        process.env[envVarName] = value;
        expect(parse.string(envVarName)).toEqual(value);
    });

    it('get default when parsing a missing string', () => {
        delete process.env[envVarName];
        expect(parse.string(envVarName, 'default')).toEqual('default');
    });

    it('throw an error on parsing a missing string', () => {
        delete process.env[envVarName];
        expect(() => parse.string(envVarName)).toThrow(`Missing environment variable: '${envVarName}'`);
    });

    it('throw an error on parsing an empty string', () => {
        const value = '';
        process.env[envVarName] = value;
        expect(() => parse.string(envVarName)).toThrow(
            `Invalid string value: '${value}' for environment variable: '${envVarName}'`
        );
    });

    it('parse an integer', () => {
        const value = 42;
        process.env[envVarName] = value.toString();
        expect(parse.integer(envVarName)).toEqual(value);
    });

    it('throw an error on parsing invalid integers', () => {
        for (const value of ['3.14', 'invalid', '']) {
            process.env[envVarName] = value;
            expect(() => parse.integer(envVarName)).toThrow(
                `Invalid integer value: '${value}' for environment variable: '${envVarName}'`
            );
        }
    });

    it('parse a bigint', () => {
        const value = 12345678901234567890n;
        process.env[envVarName] = value.toString();
        expect(parse.bigint(envVarName)).toEqual(value);
    });

    it('throw an error on parsing invalid bigints', () => {
        for (const value of ['3.14', 'invalid', '']) {
            process.env[envVarName] = value;
            expect(() => parse.bigint(envVarName)).toThrow(
                `Invalid bigint value: '${value}' for environment variable: '${envVarName}'`
            );
        }
    });

    it('parse true booleans', () => {
        for (const value of ['true', 't', '1', 'yes', 'y', 'on']) {
            process.env[envVarName] = value;
            expect(parse.boolean(envVarName)).toEqual(true);
        }
    });

    it('parse false booleans', () => {
        for (const value of ['false', 'f', '0', 'no', 'n', 'off']) {
            process.env[envVarName] = value;
            expect(parse.boolean(envVarName)).toEqual(false);
        }
    });

    it('throw an error on parsing invalid booleans', () => {
        const value = 'invalid';
        process.env[envVarName] = value;
        expect(() => parse.boolean(envVarName)).toThrow(
            `Invalid boolean value: '${value}' for environment variable: '${envVarName}'`
        );
    });

});
