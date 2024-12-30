import minimist from 'minimist';
import { sleep } from '../common/sleep';
import { AgentDb } from '../common/agent-db';

async function setupStatus(agentId: string, setupId: string, loop: boolean) {
    const db = new AgentDb(agentId);
    if (!(await db.setupExists(setupId))) {
        console.log("Setup doesn't exist");
        process.exit(-1);
    }

    do {
        if (await db.setupExists(setupId)) {
            const setup = await db.getSetup(setupId);
            console.log('Status: ' + setup.status);
        }
        await sleep(1000);
    } while (loop);
}

if (__filename == process.argv[1]) {
    const args = minimist(process.argv.slice(2), { boolean: ['loop'] });
    if (!args['agent-id']) {
        console.log('Missing parameter agent-id');
        process.exit(-1);
    }
    if (!args['setup-id']) {
        console.log('Missing parameter setup-id');
        process.exit(-1);
    }

    setupStatus(args['agent-id'], args['setup-id'], !!args['loop']);
}
