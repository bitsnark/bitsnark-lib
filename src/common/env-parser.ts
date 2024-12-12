type ParsedValue = string | number | bigint | boolean;
type ParsingFunction = (value: string, defaultValue?: ParsedValue) => ParsedValue;
function parseEnv(name: string, parser: ParsingFunction, defaultValue?: ParsedValue): ParsedValue {
    const value = process.env[name];
    if (value === undefined) {
        if (defaultValue === undefined) {
            throw new Error(`Missing environment variable: '${name}'`);
        }
        return defaultValue;
    }
    try {
        return parser(value);
    } catch (e) {
        const error = e as Error;
        throw new Error(`${error.message} for environment variable: '${name}'`);
    }
}

function makeParsingError(value: string, type: string): Error {
    return new Error(`Invalid ${type} value: '${value}'`);
}

function parseString(value: string): string {
    if (value === '') {
        throw makeParsingError(value, 'string');
    }
    return value;
}

function parseInteger(value: string): number {
    const parsed = parseFloat(value);
    if (!Number.isInteger(parsed)) {
        throw makeParsingError(value, 'integer');
    }
    return parsed;
}

function parseBigInt(value: string): bigint {
    if (value === '') {
        throw makeParsingError(value, 'bigint');
    }
    try {
        return BigInt(value);
    } catch {
        throw makeParsingError(value, 'bigint');
    }
}

function parseBoolean(value: string): boolean {
    const TRUE_VALUES = new Set(['true', 't', '1', 'yes', 'y', 'on']);
    const FALSE_VALUES = new Set(['false', 'f', '0', 'no', 'n', 'off']);

    const lowerValue = value.toLowerCase();
    if (TRUE_VALUES.has(lowerValue)) return true;
    if (FALSE_VALUES.has(lowerValue)) return false;
    throw makeParsingError(value, 'boolean');
}

export const parse = {
    string: (name: string, defaultValue?: string): string => parseEnv(name, parseString, defaultValue) as string,
    integer: (name: string, defaultValue?: number): number => parseEnv(name, parseInteger, defaultValue) as number,
    bigint: (name: string, defaultValue?: bigint): bigint => parseEnv(name, parseBigInt, defaultValue) as bigint,
    boolean: (name: string, defaultValue?: boolean): boolean => parseEnv(name, parseBoolean, defaultValue) as boolean
};
