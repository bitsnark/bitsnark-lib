import { SetupStatus } from '../../src/agent/common/db';
import { AgentRoles, TransactionNames } from '../../src/agent/common/types';
import { TestAgent, setTestAgent } from '../test-utils';
import { Template } from '../../src/agent/common/db';
import { BitcoinNetwork } from '../../src/agent/common/bitcoin-node';

//python -m bitsnark.cli broadcast --setup-id test_setup --agent-id bitsnark_prover_1 --name $1

const testnetTxs = [
    {
        name: TransactionNames.LOCKED_FUNDS,
        blockHeight: 3489084,
        txId: '91b145591c65b0e688ff6960983eab27eeb626976d837042c0f5e4cee58f06e0'
    },
    {
        name: TransactionNames.PROVER_STAKE,
        blockHeight: 3489085,
        txId: '	0000000000000005cd5d29ff953e44b913e2f8bc32d04aa7e84a145c3909705f'
    },
    {
        name: TransactionNames.PROOF,
        blockHeight: 3491482,
        txId: '2c9e518eeab4c03c168465dd0cddabcfe66820a929bfdb70e2b6935384f4c1e4'
    },
    {
        name: TransactionNames.CHALLENGE,
        txId: '7d99d18c9706df494ed619ced79fe9e85f6fc221aceee46d963d48578a9676da',
        blockHeight: 3491526
    }
];

let testBlockHeight = 0;


async function restartSetup(agents: TestAgent[], testMode: BitcoinNetwork) {
    for (const agent of agents) {
        await agent.db.test_restartSetup('test_setup');
        for (const tx of testnetTxs) {
            await agent.db.query(
                `UPDATE templates
                SET object = jsonb_set(object, '{txId}', $1)
                WHERE name = $2;`,
                [tx.txId, tx.name]
            );
        }
        await setDataToTest(TransactionNames.PROOF, agent, testMode);
    }
}

async function setDataToTest(templateName: TransactionNames, agent: TestAgent, testMode: BitcoinNetwork) {
    if (testMode === BitcoinNetwork.TESTNET) {
        // For testnet we manually change the listener position, and updating txids
        testBlockHeight = testnetTxs.find((template) => template.name === templateName)!.blockHeight;

        await agent.db.query(
            `UPDATE Setups
            SET last_checked_block_height = $1
            WHERE id = $2;`,
            [testBlockHeight - 1, 'test_setup']
        );
    }
    else {
        testBlockHeight = await agent.listener.client.getBlockCount();
    }

    agent.templates = await agent.db.getTemplates();
    agent.pending = agent.templates.filter((template) => template.blockHash === null);

    agent.listener.tipHeight = testBlockHeight;
    agent.listener.tipHash = await agent.listener.client.getBlockHash(testBlockHeight);
}

describe('Listener integration tests on regtest', () => {
    const agents: TestAgent[] = [setTestAgent(AgentRoles.PROVER)];

    beforeAll(async () => {
        // Set setup to starting point
        await restartSetup(agents, BitcoinNetwork.REGTEST);

    }, 600000);

    // send proof
    it('Setup ready', () => {
        expect(1).toBe(1);
    });
});

describe('Listener integration on testnet', () => {
    const agents: TestAgent[] = [setTestAgent(AgentRoles.PROVER), setTestAgent(AgentRoles.VERIFIER)];


    beforeAll(async () => {
        await (async () => {
            await restartSetup(agents, BitcoinNetwork.TESTNET);
        })().catch((error) => {
            throw error;
        });
    }, 600000);

    it('Setup ready', () => {
        expect(
            testnetTxs.every((tx) => {
                return agents[0].templates.some((template) => {
                    return template.name === tx.name && template.object.txId === tx.txId;
                });
            })
        ).toBe(true);
        expect(agents[0].templates[0].setupStatus).toEqual(SetupStatus.ACTIVE);
        expect(agents[0].templates[0].lastCheckedBlockHeight).toEqual(testBlockHeight - 1);
        expect(agents[0].listener.tipHeight).toBe(testBlockHeight);
    });

    it('Find PROOF by txid', async () => {
        await agents[0].listener.searchBlock(testBlockHeight, agents[0].pending, agents[0].templates);
        const received = await agents[0].db.getReceivedTemplates('test_setup');
        expect(received.length).toEqual(1);
        expect(received[0].name).toEqual(TransactionNames.PROOF);
        expect(received[0].txId).toEqual(testnetTxs.find((tx) => tx.name === TransactionNames.PROOF)!.txId);
    }, 600000);
});

