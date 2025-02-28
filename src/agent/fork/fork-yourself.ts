import { spawn } from 'node:child_process';
import { jsonParseCustom, jsonStringifyCustom } from '../common/json';

const tsNodePath = './node_modules/.bin/ts-node';

async function run(command: string, input: string): Promise<string> {
    let buffer = Buffer.alloc(0);
    let flag = true;

    return new Promise((resolve, reject) => {
        const child = spawn(tsNodePath, ['./src/agent/fork/fork-entrypoint.ts', command], {
            stdio: ['pipe', 'pipe', 'pipe']
        });
        child.stdout.on('data', (data: Buffer) => {
            if (!flag) return;
            buffer = Buffer.concat([buffer, data]);
            if (data.includes('\n', 0, 'utf-8')) {
                const result = buffer.toString('utf-8');
                flag = false;
                resolve(result.split('\n')[0]);
            }
        });
        child.stderr.on('data', (data: Buffer) => {
            const error = data.toString('utf-8');
            if (error.startsWith('Debugger attached.')) return;
            console.error(error);
            reject(error);
        });
        child.on('error', (error) => {
            console.error(error);
            reject(error);
        });
        child.stdin!.write(input.split('\n').join('') + '\n');
    });
}

export enum ForkCommand {
    DOOMSDAY = 'DOOMSDAY'
}

export class ForkYourself {
    constructor(private command: ForkCommand) {}

    public async fork<Tin, Tout>(input: Tin): Promise<Tout> {
        const json = jsonStringifyCustom(input);
        const resultStr = await run(this.command, json);
        return jsonParseCustom(resultStr);
    }
}
