import { Transaction } from "./transactions-new";
import util from 'node:util';
import { execFileSync } from 'node:child_process';
import { readTransactions, writeTransactions } from "./db";
import { AgentRoles, TransactionNames } from "./common";

export async function signTransactions(
    role: AgentRoles,
    agentId: string,
    setupId: string,
    transactions: Transaction[]): Promise<Transaction[]> {

    await writeTransactions(agentId, setupId, transactions);

    const result = execFileSync('../venv/bin/python', [
        '-m', 'bitsnark.core.sign_transactions',
        '--role', role.toLowerCase(),
        '--agent-id', agentId,
        '--setup-id', setupId
    ], { cwd: './python' });
    
    console.log(result.toString());

    transactions = await readTransactions(agentId, setupId);
    for (const transaction of transactions) {
        if (transaction.transactionName == TransactionNames.PROOF_REFUTED) continue;
        if (!transaction.txId)
            throw new Error('Missing txId');
        if (role == AgentRoles.PROVER && !transaction.inputs.every(i => i.proverSignature))
            throw new Error('Missing signature');
        if (role == AgentRoles.VERIFIER && !transaction.inputs.every(i => i.verifierSignature))
            throw new Error('Missing signature');
    }

    return transactions;
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = await readTransactions(agentId, setupId)
    signTransactions(AgentRoles.PROVER, agentId, setupId, transactions).catch(console.error);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
