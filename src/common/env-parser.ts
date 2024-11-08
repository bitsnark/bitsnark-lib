export const enum ParsedType {
    INTEGER = "int",
    BIGINT = "bigint",
    BOOLEAN = "boolean",
}

// eslint-disable-next-line  @typescript-eslint/no-unsafe-function-type
const PARSERS = new Map<string, Function>([
    ['int', parseInteger],
    ['bigint', parseBigInt],
    ['boolean', parseBoolean],
]);

export function parseEnv(env: NodeJS.ProcessEnv, name: string, type: string, defaultValue: any): any {
    const parser = PARSERS.get(type);

    if (!parser) {
        throw new Error(`Unsupported type: ${type}`);
    }

    const value = env[name];

    try {
        return parser(value, defaultValue);
    } catch (e) {
        throw new Error(`Invalid value: ${name}: ${value}`);
    }
}

function parseInteger(value: string, defaultValue: number): number {
    const returnValue = Number(value ?? defaultValue);

    if (!Number.isInteger(returnValue)) {
        throw new Error();
    }
    
    return returnValue;
}
    
function parseBigInt(value: string, defaultValue: bigint): bigint {
    if (value === undefined) return defaultValue;

    return BigInt(value);
}
    
function parseBoolean(value: string, defaultValue: boolean = false): boolean {
    const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
    const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);

    if (value === undefined) return defaultValue;
    
    const v = value.toLowerCase();

    if (TRUE_VALUES.has(v)) return true;
    if (FALSE_VALUES.has(v)) return false;

    throw new Error();
}
