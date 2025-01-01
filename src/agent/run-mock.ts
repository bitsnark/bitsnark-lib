import minimist from 'minimist';
import { ProtocolProver } from './protocol-logic/protocol-prover';
import { ProtocolVerifier } from './protocol-logic/protocol-verifier';
import { sleep } from './common/sleep';
import { agentConf } from './agent.conf';
import { MockPublisher } from './protocol-logic/mock-publisher';
import { proofBigint } from './common/constants';
import { randomBytes } from 'node:crypto';
import { Agent } from './setup/agent';
import { AgentRoles, SetupStatus } from './common/types';
import { startSetup } from './setup/start-setup';
import { AgentDb } from './common/agent-db';

export async function main(proverAgentId: string, verifierAgentId: string, setupId?: string) {

    if (!setupId) {
        setupId = randomBytes(32).toString('hex');

        const proverAgent = new Agent(proverAgentId, AgentRoles.PROVER);
        proverAgent.launch();

        const verifierAgent = new Agent(verifierAgentId, AgentRoles.VERIFIER);
        verifierAgent.launch();

        await startSetup(proverAgentId, verifierAgentId, setupId);

        const db = new AgentDb(proverAgentId);

        // wait for setup to be active
        while (true) {
            const setup = await db.getSetup(setupId);
            if (setup.status === SetupStatus.ACTIVE) {
                break;
            }
            await sleep(100);
        }
    }

    const listener = new MockPublisher(proverAgentId, verifierAgentId, setupId);
    listener.start();

    const prover = new ProtocolProver(proverAgentId, setupId);
    const verifier = new ProtocolVerifier(verifierAgentId, setupId);

    const proof = proofBigint.map(p => p);
    proof[0] = 0n;

    prover.pegOut(proof);

    const doit = async () => {
        try {
            await prover.process();
        } catch (e) {
            console.error(e);
        }

        try {
            await verifier.process();
        } catch (e) {
            console.error(e);
        }
    };

    do {
        doit();
        await sleep(agentConf.protocolIntervalMs);
        /*eslint no-constant-condition: "off"*/
    } while (true);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const proverAgentId = args['prover-agent-id'] ?? 'bitsnark_prover_1';
    const verifierAgentId = args['verifier-agent-id'] ?? 'bitsnark_verifier_1';
    const setupId = args['setup-id']; // if null, create a new setup 

    main(proverAgentId, verifierAgentId, setupId).catch((error) => {
        console.error(error);
        throw error;
    });
}
