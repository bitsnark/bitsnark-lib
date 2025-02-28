export function jsonStringifyCustom<T>(obj: T): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') return `bigint:${value.toString(16)}n`;
        if (value?.type == 'Buffer' && value.data) {
            return 'Buffer:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    });
}

export function jsonParseCustom<T>(json: string): T {
    return JSON.parse(json, (key, value) => {
        if (typeof value === 'string' && value.startsWith('bigint:') && value.endsWith('n'))
            return BigInt(value.replace('bigint:', '0x').replace('n', ''));
        if (typeof value === 'string' && value.startsWith('Buffer:'))
            return Buffer.from(value.replace('Buffer:', ''), 'hex');
        return value;
    }) as T;
}
