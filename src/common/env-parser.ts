
export class EnvParser {
    env: NodeJS.ProcessEnv;

    constructor(env: NodeJS.ProcessEnv) {
        this.env = env;
    }

    parseInteger(name: string, defaultValue: number): number {
        const value = Number(this.env[name] ?? defaultValue);
        if (!Number.isInteger(value)) {
            throw new Error(`Value should be integer: ${name}: ${value}`);
        }
        return value;
    }
    
    parseBigInt(name: string, defaultValue: bigint): bigint {
        const value = this.env[name];
    
        if (value === undefined) return defaultValue;
    
        try {
            return BigInt(value);
        } catch (e) {
            throw new Error(`Value should be bigint: ${name}: ${value}`);
        }
    }
    
    parseBoolean(name: string, defaultValue: boolean = false): boolean {
        const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on']);
        const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'off']);
    
        const value = this.env[name]?.toLocaleLowerCase();
    
        if (value === undefined) return defaultValue;
    
        if (TRUE_VALUES.has(value)) return true;
        if (FALSE_VALUES.has(value)) return false;
        throw new Error(`Value should be boolean: ${name}: ${value}`);
    }
    
}
