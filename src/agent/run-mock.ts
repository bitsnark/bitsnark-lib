import minimist from 'minimist';
import { Agent } from './setup/agent';
import { AgentDb } from './common/agent-db';
import { agentConf } from './agent.conf';
import { AgentRoles, SetupStatus } from './common/types';
import { ProtocolProver } from './protocol-logic/protocol-prover';
import { ProtocolVerifier } from './protocol-logic/protocol-verifier';
import { sleep } from './common/sleep';
import { proofBigint } from './common/constants';
import { randomBytes } from 'node:crypto';
import { startSetup } from './setup/start-setup';
import { BitcoinListener } from './listener/bitcoin-listener';
import { MockPublisher } from './protocol-logic/mock-publisher';

const MOCK = false;

export async function main(proverAgentId: string, verifierAgentId: string, setupId?: string) {
    if (!setupId) {
        setupId = randomBytes(32).toString('hex');

        const proverAgent = new Agent(proverAgentId, AgentRoles.PROVER);
        proverAgent.launch();

        const verifierAgent = new Agent(verifierAgentId, AgentRoles.VERIFIER);
        verifierAgent.launch();

        await startSetup(proverAgentId, verifierAgentId, setupId);

        const proverDb = new AgentDb(proverAgentId);
        const verifierDb = new AgentDb(verifierAgentId);

        // Wait for setup to be active
        while (true) {
            const setup1 = await proverDb.getSetup(setupId);

            // The verifier may not have the setup yet
            const setup2 = await verifierDb.getSetupOrNull(setupId);

            // Are they both active?
            if (setup1.status === SetupStatus.ACTIVE && setup2 && setup2.status === SetupStatus.ACTIVE) {
                break;
            }

            // Wait a bit
            await sleep(100);
        }
    }

    if (MOCK) {
        new MockPublisher(proverAgentId, verifierAgentId, setupId).start();
    } else {
        for (const agentId of [proverAgentId, verifierAgentId]) {
            new BitcoinListener(agentId).startBlockchainCrawler();
        }
    }

    const prover = new ProtocolProver(proverAgentId, setupId);
    const verifier = new ProtocolVerifier(verifierAgentId, setupId);

    const proof = proofBigint.map((p) => p);
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
        await doit();
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
