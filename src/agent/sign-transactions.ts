import { Transaction } from "./transactions-new";
import util from 'node:util';
import child_process from 'node:child_process';
import { readTransactions } from "./db";
const exec = util.promisify(child_process.exec);

export async function signTransactions(agentId: string, setupId: string): Promise<Transaction[]> {

    await exec(
        `cd python && python -m bitsnark.core.sign_transactions --agent-id ${agentId} --setup-id '${setupId}'`
    ).then(({ stdout, stderr }) => {
        console.log(stdout);
        console.error(stderr);
    }).catch(err => {
        console.log(err);
        throw err;
    });

    const transactions = await readTransactions(agentId, setupId);
    for (const transaction of transactions) {
        if (transaction.
    }

}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    signTransactions('bitsnark-prover-1', 'test_setup').catch(console.error);
}
