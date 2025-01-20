import minimist from 'minimist';
import { Agent } from './setup/agent';
import { AgentDb } from './common/agent-db';
import { agentConf } from './agent.conf';
import { AgentRoles, SetupStatus } from './common/types';
import { ProtocolProver } from './protocol-logic/protocol-prover';
import { ProtocolVerifier } from './protocol-logic/protocol-verifier';
import { sleep } from './common/sleep';
import { proofBigint } from './common/constants';
import { startSetup } from './setup/start-setup';
import { BitcoinListener } from './listener/bitcoin-listener';
import { MockPublisher } from './protocol-logic/mock-publisher';

export async function main(proverAgentId: string, verifierAgentId: string, setupId: string, regtest?: boolean) {
    console.log(`Starting mock setup ${setupId} with prover ${proverAgentId} and verifier ${verifierAgentId}`);
    console.log('Make sure the bitcoin services are running:');
    console.log(`npm run start-bitcoin-services ${proverAgentId} ${verifierAgentId}`);

    const proverAgent = new Agent(proverAgentId, AgentRoles.PROVER);
    proverAgent.launch().catch((error) => {
        console.error(error);
    });

    const verifierAgent = new Agent(verifierAgentId, AgentRoles.VERIFIER);
    verifierAgent.launch().catch((error) => {
        console.error(error);
    });

    await startSetup(proverAgentId, verifierAgentId, setupId);

    const proverDb = new AgentDb(proverAgentId);
    const verifierDb = new AgentDb(verifierAgentId);

    // Wait for setup to be active
    while ((await sleep(100)) == undefined) {
        const proverSetup = await proverDb.getSetup(setupId);

        // The verifier may not have the setup yet
        const verifierSetup = await verifierDb.getSetupOrNull(setupId);

        // Are they both active?
        if (proverSetup.status === SetupStatus.ACTIVE && verifierSetup && verifierSetup.status === SetupStatus.ACTIVE) {
            break;
        }
    }

    if (regtest) {
        for (const agentId of [proverAgentId, verifierAgentId]) {
            console.log(`Starting blockchain listener for ${agentId}`);
            new BitcoinListener(agentId).startBlockchainCrawler().catch((error) => {
                console.error(error);
            });
        }
    } else {
        console.log('Starting mock publisher');
        await new MockPublisher(proverAgentId, verifierAgentId, setupId).start();
    }

    const prover = new ProtocolProver(proverAgentId, setupId);
    const verifier = new ProtocolVerifier(verifierAgentId, setupId);

    const proof = proofBigint.map((p) => p);
    proof[0] = 0n;

    await prover.pegOut(proof);

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
    } while ((await sleep(agentConf.protocolIntervalMs)) == undefined);
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const proverAgentId = args['prover-agent-id'] ?? 'bitsnark_prover_1';
    const verifierAgentId = args['verifier-agent-id'] ?? 'bitsnark_verifier_1';
    const setupId = args['setup-id'] ?? 'test_setup';
    const regtest = args['regtest'] ?? false;

    main(proverAgentId, verifierAgentId, setupId, regtest).catch((error) => {
        console.error(error);
        throw error;
    });
}
