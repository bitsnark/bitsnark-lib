import { spawn } from 'node:child_process';
import { jsonParseCustom, jsonStringifyCustom } from '../common/json';

const tsNodePath = './node_modules/.bin/ts-node';

async function run(command: string, input: string): Promise<string> {

    let result = '';

    return new Promise((resolve, reject) => {
        const child = spawn(
            tsNodePath,
            ['./src/agent/fork/fork-entrypoint.ts', command],
        { stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdout.on('data', (data: Buffer) => {
            const s = data.toString('utf-8');
            result += s;
            if (result.includes('\n')) {
                resolve(result.split('\n')[0]);
            }
        });
        child.stdin!.write(input.split('\n').join('') + '\n');
        child.on('error', (error) => {
            console.error(error);
            reject(error);
        });
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
