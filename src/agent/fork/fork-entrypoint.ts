import * as readline from 'readline';
import { AgentDb } from '../common/agent-db';
import { DoomsdayGenerator } from '../final-step/doomsday-generator';
import { ForkCommand } from './fork-yourself';
import { jsonStringifyCustom } from '../common/json';

export interface GenerateFinalTaprootCommand {
    agentId: string;
    setupId: string;
    indexFrom: number;
    indexTo: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const commands: { [key: string]: (input: any) => any } = {
    [ForkCommand.DOOMSDAY]: async (input: GenerateFinalTaprootCommand) => {
        const ddg = new DoomsdayGenerator(input.agentId, input.setupId);
        const db = new AgentDb(input.agentId);
        const templates = await db.getTemplates(input.setupId);
        const result = ddg.generateFinalStepTaprootChunk(templates, input.indexFrom ?? 0, input.indexTo ?? 0);
        return result;
    }
};

export async function main() {
    const command = process.argv[2];
    if (!command) {
        console.error('I need a command to run');
        process.exit(-1);
    }
    const fun = commands[command as ForkCommand];
    if (!fun) {
        console.error('Command not found: ', command);
        process.exit(-1);
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on('line', async (line: string) => {
        const result = await fun(JSON.parse(line));
        console.log(jsonStringifyCustom(result) + '\n');
        process.exit(0);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
