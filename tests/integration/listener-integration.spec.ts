import { AgentRoles, TemplateNames, SetupStatus } from '../../src/agent/common/types';
import { TestAgent, generateBlocks, setTestAgent } from '../test-utils/test-utils';
import { agentConf } from '../../src/agent/agent.conf';
import { getReceivedTemplates } from '../../src/agent/listener/listener-utils';

//python -m bitsnark.cli broadcast --setup-id test_setup --agent-id bitsnark_prover_1 --name $1
export enum BitcoinNetwork {
    TESTNET = 'testnet',
    REGTEST = 'regtest'
}

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

async function restartSetup(agents: TestAgent[], testMode: BitcoinNetwork) {
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
        await setDataToTest(TemplateNames.PROOF, agent, testMode);
    }
}

async function setDataToTest(templateName: TemplateNames, agent: TestAgent, testMode: BitcoinNetwork) {
    let testBlockHeight: number;
    if (testMode === BitcoinNetwork.TESTNET) {
        // For testnet we manually change the listener position, and updating txids
        testBlockHeight = testnetTxs.find((template) => template.name === templateName)!.blockHeight;
    } else {
        testBlockHeight = await agent.listener.client.getBlockCount();
    }

    await agent.db.query(
        `UPDATE Setups
        SET last_checked_block_height = $1
        WHERE id = $2;`,
        [testBlockHeight - 1, 'test_setup']
    );

    agent.templatesRows = await getReceivedTemplates(agent.db.listenerDb);
    agent.pending = agent.templatesRows.filter((template) => !template.blockHash);
    if (testMode === BitcoinNetwork.TESTNET) {
        agent.pending = agent.pending.filter((template) => template.name === TemplateNames.PROOF);
    }

    agent.listener.tipHeight = testBlockHeight;
    agent.listener.tipHash = await agent.listener.client.getBlockHash(testBlockHeight);
}

//REGTEST only
async function overwriteDBTxidByBlockchainTxid(agent: TestAgent, templateName: TemplateNames, isRestart = true) {
    await generateBlocks(agent.listener.client, 1);
    const tip = await agent.listener.client.getBlockCount();
    const hash = await agent.listener.client.getBestBlockHash();
    const randomTx = (await agent.listener.client.getBlock(hash)).tx[0];

    if (isRestart) await agent.db.test_restartSetup(agent.setupId || 'test_setup');

    await agent.db.query(
        `UPDATE templates
        SET txid = $1
        WHERE name = $2;`,
        [randomTx, templateName]
    );

    await setDataToTest(templateName, agent, BitcoinNetwork.REGTEST);
    return randomTx;
}

(agentConf.bitcoinNodeNetwork === BitcoinNetwork.REGTEST ? describe : describe.skip)(
    `Listener integration tests on regtest`,
    () => {
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
            const testBlockHeight = agents[0].listener.tipHeight;
            await agents[0].listener.searchBlock(testBlockHeight, agents[0].pending, agents[0].templatesRows);
            const received = (await getReceivedTemplates(agents[0].db.listenerDb)).filter((tx) => tx.blockHash);
            expect(received.length).toEqual(1);
            expect(received[0].name).toEqual(TemplateNames.PROOF);
            expect(received[0].txid).toEqual(proof);
        }, 600000);
    }
);

(agentConf.bitcoinNodeNetwork === BitcoinNetwork.TESTNET ? describe : describe.skip)(
    'Listener integration on testnet',
    () => {
        let agents: TestAgent[] = [];

        beforeAll(async () => {
            agents = [setTestAgent(AgentRoles.PROVER)];
            await restartSetup(agents, BitcoinNetwork.TESTNET);
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

            const testBlockHeight = agents[0].listener.tipHeight;
            await agents[0].listener.searchBlock(testBlockHeight, agents[0].pending, agents[0].templatesRows);
            const received = (await getReceivedTemplates(agents[0].db.listenerDb)).filter((tx) => tx.blockHash);
            expect(received.length).toEqual(1);
            expect(received[0].name).toEqual(TemplateNames.PROOF);
            expect(received[0].txid).toEqual(proof);
            expect(proof).toBeDefined();
        }, 600000);
    }
);
