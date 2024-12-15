import * as readline from 'readline';
import { execFile } from "node:child_process";
import { jsonParseCustom, jsonStringifyCustom } from "../common/json";

const tsNodePath = '/usr/local/bin/ts-node';

async function run(command: string, input: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = execFile(
            tsNodePath,
            ['./src/agent/fork/fork-entrypoint.ts', command],
            { cwd: '.' },
            (error, stdout, stderr) => {
                console.error(stderr);
                if (error) {
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        readline.createInterface({ input: child.stdout! }).on('line', line => console.log(line));
        readline.createInterface({ input: child.stderr! }).on('line', line => console.error(line));
        child.stdin!.write(input.split('\n').join('') + '\n');
    });
}

export enum ForkCommand {
    DOOMSDAY = 'DOOMSDAY'
}

export class ForkYourself {

    constructor(private command: ForkCommand) { }

    public async fork<Tin, Tout>(input: Tin): Promise<Tout> {
        const json = jsonStringifyCustom(input);
        const resultStr = await run(this.command, json);
        return jsonParseCustom(resultStr);
    }
}
