import { AgentDbMock } from '../test-utils/agent-db-mock';
import { ProtocolProver } from '../../src/agent/protocol-logic/protocol-prover';
import { ProtocolVerifier } from '../../src/agent/protocol-logic/protocol-verifier';
import { payloadUtxo, proverUtxo, setTestAgent, TestAgent } from '../test-utils/test-utils';
import { emulateSetup } from '../../src/agent/setup/emulate-setup';
import { AgentRoles } from '../../src/agent/common/types';

describe('Protocol logic', () => {
    const prover = setTestAgent(AgentRoles.PROVER);
    const verifier = setTestAgent(AgentRoles.VERIFIER);

    beforeAll(async () => {
        [prover, verifier].map((agent) => agent.db.test_restartSetup(prover.setupId));
        await emulateSetup(prover.agentId, verifier.agentId, prover.setupId!, false, payloadUtxo, proverUtxo);

        prover.protocol = new ProtocolProver(prover.agentId, prover.setupId);
        verifier.protocol = new ProtocolVerifier(verifier.agentId, verifier.setupId);

        [prover, verifier].map(async (agent) => {
            agent.setup = await agent.db.getSetup(agent.setupId);
            agent.templates = await agent.db.getTemplates(agent.setupId);
            agent.db = new AgentDbMock(agent.agentId);
            (agent.db as AgentDbMock).getSetupReturn = agent.setup;
            (agent.db as AgentDbMock).getTemplatesReturn = agent.templates;
            console.log(agent.agentId, (agent.db as AgentDbMock).getSetupReturn);
            console.log(agent.agentId, (agent.db as AgentDbMock).getTemplatesReturn);
        });

        //create setup in agentsMockDBs

        //const setup = await prover.db.getSetup(setupId);
    });

    it('should make sure setup ready', async () => {
        expect((prover.db as AgentDbMock).getSetupCalledCount).toBe(0);
        expect((prover.db as AgentDbMock).getSetupReturn).toContain('setupId');
        expect((prover.db as AgentDbMock).getTemplatesReturn).toBeGreaterThan(1);
    });
});
