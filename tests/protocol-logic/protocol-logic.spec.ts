import { AgentDbMock } from '../test-utils/agent-db-mock';
import { ProtocolProver } from '../../src/agent/protocol-logic/protocol-prover';
import { ProtocolVerifier } from '../../src/agent/protocol-logic/protocol-verifier';
import { payloadUtxo, proverUtxo, setTestAgent, TestAgent } from '../test-utils/test-utils';
import { emulateSetup } from '../../src/agent/setup/emulate-setup';
import { AgentRoles, SetupStatus } from '../../src/agent/common/types';
import { proofBigint } from '../../src/agent/common/constants';
import { TestPublisher } from '../mock-publisher';
import { agentConf } from '../../src/agent/agent.conf';

describe('Protocol logic', () => {
    const proof = proofBigint;
    const boojum = proofBigint;
    boojum[0] = boojum[0] + 1n;

    const prover = setTestAgent(AgentRoles.PROVER);
    const verifier = setTestAgent(AgentRoles.VERIFIER);
    let publisher: TestPublisher;

    beforeAll(async () => {
        if ((await prover.db.query('SELECT COUNT(*) FROM setups WHERE id = $1;', [prover.setupId])).rows[0][0])
            [prover, verifier].map((agent) => agent.db.test_restartSetup(prover.setupId));
        else await emulateSetup(prover.agentId, verifier.agentId, prover.setupId!, payloadUtxo, proverUtxo, false);

        prover.protocol = new ProtocolProver(prover.agentId, prover.setupId);
        verifier.protocol = new ProtocolVerifier(verifier.agentId, verifier.setupId);

        publisher = new TestPublisher(prover.agentId, verifier.agentId, prover.setupId);

        for (const agent of [prover, verifier]) {
            agent.setup = await agent.db.getSetup(agent.setupId);
            agent.templates = await agent.db.getTemplates(agent.setupId);
            agent.db = new AgentDbMock(agent.agentId);
            //console.log((prover.db as AgentDbMock).getSetupCalledCount);
            (agent.db as AgentDbMock).getSetupReturn = agent.setup;
            (agent.db as AgentDbMock).getTemplatesReturn = agent.templates;
            (agent.db as AgentDbMock).getReceivedTransactionsReturn = [];
            (agent.db as AgentDbMock).gettestTemplatesReturn = agent.templates.map((template) => {
                return {
                    ...template,
                    data: []
                };
            });
            publisher.dbs[agent.role as 'prover' | 'verifier'] = agent.db;
        }
    }, 60000);

    it('should make sure setup ready', async () => {
        expect(await prover.db.getSetup(prover.setupId)).toMatchObject({
            id: prover.setupId,
            status: SetupStatus.ACTIVE
        });
        expect(await prover.db.getTemplates(prover.setupId)).toMatchObject(prover.templates);
        expect((await prover.db.getTemplates(prover.setupId)).length).toBeGreaterThan(0);
        expect(await prover.db.getReceivedTransactions(prover.setupId)).toHaveLength(0);
    }, 60000);
});
