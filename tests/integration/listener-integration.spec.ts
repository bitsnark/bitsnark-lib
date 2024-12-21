import { AgentRoles, TemplateNames, SetupStatus } from '../../src/agent/common/types';
import { TestAgent, generateBlocks, setTestAgent } from '../test-utils/test-utils';
import { getTemplatesRows } from '../../src/agent/listener/listener-utils';

async function setDataToTest(agent: TestAgent) {
    const testBlockHeight = await agent.listener.client.getBlockCount();
    await agent.db.query(
        `UPDATE Setups
        SET last_checked_block_height = $1
        WHERE id = $2;`,
        [testBlockHeight - 1, 'test_setup']
    );

    agent.templatesRows = await getTemplatesRows(agent.db.listenerDb);
    agent.pending = agent.templatesRows.filter((template) => !template.blockHash);

    agent.listener.joinedTemplates = agent.templatesRows;
    agent.listener.tipHeight = testBlockHeight;
    agent.listener.tipHash = await agent.listener.client.getBlockHash(testBlockHeight);
}

//REGTEST only
async function overwriteDBTxidByBlockchainTxid(agent: TestAgent, templateName: TemplateNames, isRestart = true) {
    await generateBlocks(agent.listener.client, 1);
    const hash = await agent.listener.client.getBestBlockHash();
    const randomTx = ((await agent.listener.client.getBlock(hash)).tx as string[])[0];

    if (isRestart) await agent.db.test_restartSetup(agent.setupId || 'test_setup');

    await agent.db.query(
        `UPDATE templates
        SET txid = $1
        WHERE name = $2;`,
        [randomTx, templateName]
    );

    await setDataToTest(agent);
    return randomTx;
}

describe(`Listener integration tests on regtest`, () => {
    const agents = [setTestAgent(AgentRoles.PROVER)];
    let proof = '';

    beforeAll(async () => {
        // Set setup to starting point
        proof = await overwriteDBTxidByBlockchainTxid(agents[0], TemplateNames.PROOF);
    }, 600000);

    // send proof
    it('Setup ready', async () => {
        const testBlockHeight = agents[0].listener.tipHeight;
        expect(
            agents[0].templatesRows.findIndex((tx) => {
                return tx.name === TemplateNames.PROOF && tx.txid === proof;
            })
        ).toBeGreaterThan(-1);
        expect(agents[0].templatesRows[0].setupStatus).toEqual(SetupStatus.ACTIVE);
        expect(agents[0].templatesRows[0].lastCheckedBlockHeight).toBe(testBlockHeight - 1);
    }, 600000);

    it('Find PROOF by txid', async () => {
        await agents[0].listener.monitorTransmitted();
        const joined = await getTemplatesRows(agents[0].db.listenerDb);
        const received = joined.filter((tx) => tx.blockHash);
        expect(received.length).toEqual(1);
        expect(received[0].name).toEqual(TemplateNames.PROOF);
        expect(received[0].txid).toEqual(proof);
    }, 600000);
});
