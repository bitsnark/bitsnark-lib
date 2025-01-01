import minimist from 'minimist';
import { AgentRoles } from './common/types';
import { Agent } from './setup/agent';
import { AgentDb } from './common/agent-db';
import { ProtocolProver } from './protocol-logic/protocol-prover';
import { ProtocolVerifier } from './protocol-logic/protocol-verifier';
import { sleep } from './common/sleep';
import { agentConf } from './agent.conf';
import { BitcoinListener } from './listener/bitcoin-listener';

export async function main(proverAgentId: string, verifierAgentId: string) {
    if (proverAgentId) {
        const agent = new Agent(proverAgentId, AgentRoles.PROVER);
        agent.launch();
        const listener = new BitcoinListener(proverAgentId);
        listener.startBlockchainCrawler();
    }

    if (verifierAgentId) {
        const agent = new Agent(verifierAgentId, AgentRoles.VERIFIER);
        agent.launch();
        const listener = new BitcoinListener(proverAgentId);
        listener.startBlockchainCrawler();
    }

    const doit = async () => {
        if (proverAgentId) {
            try {
                const db = new AgentDb(proverAgentId);
                const setups = await db.getActiveSetups();
                for (const setup of setups) {
                    const protocol = new ProtocolProver(proverAgentId, setup.id);
                    await protocol.process();
                }
            } catch (e) {
                console.error(e);
            }
        }

        if (verifierAgentId) {
            try {
                const db = new AgentDb(verifierAgentId);
                const setups = await db.getActiveSetups();
                for (const setup of setups) {
                    const protocol = new ProtocolVerifier(verifierAgentId, setup.id);
                    await protocol.process();
                }
            } catch (e) {
                console.error(e);
            }
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
    const proverAgentId = args['prover-agent-id'];
    const verifierAgentId = args['verifier-agent-id'];

    if (proverAgentId === undefined && verifierAgentId === undefined) {
        console.error('Please provide prover-agent-id or verifier-agent-id or both');
        process.exit(1);
    }

    if (proverAgentId && !agentConf.keyPairs[proverAgentId]) {
        console.error('Agent not found in config:', proverAgentId);
        process.exit(1);
    }

    if (verifierAgentId && !agentConf.keyPairs[verifierAgentId]) {
        console.error('Agent not found in config:', verifierAgentId);
        process.exit(1);
    }

    console.log('Starting agents with ids:', proverAgentId ?? '', verifierAgentId ?? '');
    main(proverAgentId, verifierAgentId).catch((error) => {
        console.error(error);
        throw error;
    });
}
