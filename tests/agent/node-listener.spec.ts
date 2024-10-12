
import { NodeListener } from '../../src/agent/node-listener'
import { exec } from 'child_process';
const Client = require('bitcoin-core');
import { agentConf } from '../../src/agent/agent.conf';
import { readPendingTransactions, writeTransaction } from '../../src/agent/db';
import { AgentRoles } from '../../src/agent/common';
import exp from 'constants';

let nodeListener: NodeListener;
let txid = '';

describe("node-listener test", function () {

    const client = new Client({
        network: agentConf.bitcoinNodeNetwork,
        username: agentConf.bitcoinNodeUsername,
        password: agentConf.bitcoinNodePassword,
        host: agentConf.bitcoinNodeHost,
        port: agentConf.bitcoinNodePort

    })

    async function checkPendingTransactions(expectedCount: number) {
        const pending = await readPendingTransactions();
        expect(pending).toBeDefined();
        expect(pending.length).toBeGreaterThan(0);
        expect(pending.filter((row: any) => {
            row.txId === txid
        }).length).toBe(expectedCount);
    }


    it("should find a tx in the last block", async () => {
        const blockHash = await client.getBestBlockHash();
        const block = await client.getBlock(blockHash);
        if (!block.tx.length) throw new Error('No blocks');
        txid = block.tx[0];
        expect(txid).toBeDefined();
    });

    it("Should insert test transaction to template table", async () => {
        await expect(writeTransaction("tester-agent", Math.random().toString().substring(2), {
            transactionName: "test-transaction",
            ordinal: 1,
            txId: txid,
            role: AgentRoles.PROVER,
            inputs: [],
            outputs: []
        })).resolves.not.toThrow();

    });

    it("Should find test transaction in pendingTransactions select", async () => {
        await checkPendingTransactions(1)
    });

    // it("Should start listenet", async () => {
    //     nodeListener = new NodeListener()
    // });

    // it("Should remove test transaction pendingTransactions automaticly", async () => {
    //     await checkPendingTransactions(0)
    // });

});

