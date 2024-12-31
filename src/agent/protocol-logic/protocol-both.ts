import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { AgentDb } from '../common/agent-db';
import { sleep } from '../common/sleep';
import { ProtocolVerifier } from './protocol-verifier';
import { ProtocolProver } from './protocol-prover';

export async function main(proverAgentId: string, verifierAgentId: string) {
    const doit = async () => {
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
    main(proverAgentId, verifierAgentId).catch((error) => {
        throw error;
    });
}
