import { AgentRoles, TemplateNames, SetupStatus } from '../../src/agent/common/types';
import { TestAgent, setTestAgent } from '../test-utils/test-utils';
import { getTemplatesRows } from '../../src/agent/listener/listener-utils';

const testnetTxs = [
    {
        name: TemplateNames.LOCKED_FUNDS,
        blockHeight: 3489084,
        txId: '91b145591c65b0e688ff6960983eab27eeb626976d837042c0f5e4cee58f06e0'
    },
    {
        name: TemplateNames.PROVER_STAKE,
        blockHeight: 3489085,
        txId: '	0000000000000005cd5d29ff953e44b913e2f8bc32d04aa7e84a145c3909705f'
    },
    {
        name: TemplateNames.PROOF,
        blockHeight: 3491482,
        txId: '2c9e518eeab4c03c168465dd0cddabcfe66820a929bfdb70e2b6935384f4c1e4'
    },
    {
        name: TemplateNames.CHALLENGE,
        txId: '7d99d18c9706df494ed619ced79fe9e85f6fc221aceee46d963d48578a9676da',
        blockHeight: 3491526
    }
];

async function restartSetup(agents: TestAgent[]) {
    for (const agent of agents) {
        await agent.db.test_restartSetup('test_setup');
        for (const tx of testnetTxs) {
            await agent.db.query(
                `UPDATE templates
                SET txid = $1
                WHERE name = $2;`,
                [tx.txId, tx.name]
            );
        }
        await setDataToTest(TemplateNames.PROOF, agent);
    }
}

async function setDataToTest(templateName: TemplateNames, agent: TestAgent) {
    const testBlockHeight = testnetTxs.find((template) => template.name === templateName)!.blockHeight;

    await agent.db.query(
        `UPDATE Setups
        SET last_checked_block_height = $1
        WHERE id = $2;`,
        [testBlockHeight - 1, 'test_setup']
    );

    agent.templatesRows = await getTemplatesRows(agent.db.listenerDb);
    agent.pending = agent.templatesRows.filter((template) => template.name === TemplateNames.PROOF);

    agent.listener.tipHeight = testBlockHeight;
    agent.listener.tipHash = await agent.listener.client.getBlockHash(testBlockHeight);
}

describe('Listener integration on testnet', () => {
    let agents: TestAgent[] = [];

    beforeAll(async () => {
        agents = [setTestAgent(AgentRoles.PROVER)];
        await restartSetup(agents);
    }, 600000);

    it('Setup ready', () => {
        const testBlockHeight = agents[0].listener.tipHeight;
        expect(
            testnetTxs.every((tx) => {
                return agents[0].templatesRows.some((template) => {
                    return template.name === tx.name && template.txid === tx.txId;
                });
            })
        ).toBe(true);
        expect(agents[0].templatesRows[0].setupStatus).toEqual(SetupStatus.ACTIVE);
        expect(agents[0].templatesRows[0].lastCheckedBlockHeight).toBe(testBlockHeight - 1);
    }, 600000);

    it('Find PROOF by txid', async () => {
        const proof = testnetTxs.find((tx) => tx.name === TemplateNames.PROOF)!.txId;
        expect(proof).toBeDefined();

        await agents[0].listener.monitorTransmitted();
        const received = (await getTemplatesRows(agents[0].db.listenerDb)).filter((tx) => tx.blockHash);
        expect(received.length).toEqual(1);
        expect(received[0].name).toEqual(TemplateNames.PROOF);
        expect(received[0].txid).toEqual(proof);
    }, 600000);

    it('Find CHALLENGE by inputs', async () => {
        const challenge = testnetTxs.find((tx) => tx.name === TemplateNames.CHALLENGE);
        await setDataToTest(TemplateNames.CHALLENGE, agents[0]);
        expect(challenge).toBeDefined();

        await agents[0].listener.monitorTransmitted();
        const received = (await getTemplatesRows(agents[0].db.listenerDb)).filter((tx) => tx.blockHash);
        expect(received.length).toEqual(2);
        expect(received[1].name).toEqual(TemplateNames.CHALLENGE);
        expect(received[1].txid).toEqual(challenge!.txId);
    }, 600000);
});
