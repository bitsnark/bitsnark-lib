import minimist from 'minimist';
import { sleep } from '../common/sleep';
import { AgentDb } from '../common/agent-db';

async function setupStatus(agentId: string, setupId: string, loop: boolean) {
    const db = new AgentDb(agentId);

    if (setupId && !(await db.setupExists(setupId))) {
        console.log("Setup doesn't exist");
        process.exit(-1);
    }

    do {
        const setups = setupId ? [await db.getSetup(setupId)] : await db.getSetups();
        for (const setup of setups) {
            console.log(`${setup.id}: ${setup.status}`);
        }
        await sleep(1000);
    } while (loop);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2), { boolean: ['loop'] });
    const agentId = args['agent-id'] ?? 'bitsnark_prover_1';

    setupStatus(agentId, args['setup-id'], !!args['loop']).catch((error) => {
        console.error(error);
    });
}
