import { Transaction } from './transactions-new';
import { execFileSync } from 'node:child_process';
import { readTemplates } from './db';
import { AgentRoles, TransactionNames } from './common';

export async function signTransactions(
    role: AgentRoles,
    agentId: string,
    setupId: string,
    transactions: Transaction[]
): Promise<Transaction[]> {
    // On macOS, "System Integrety Protection" clears the DYLD_FALLBACK_LIBRARY_PATH,
    // which leaves the Python executable unable to find the secp256k1 library installed by Homebrew.
    if (!process.env.DYLD_FALLBACK_LIBRARY_PATH) {
        process.env.DYLD_FALLBACK_LIBRARY_PATH = '/opt/homebrew/lib:/usr/local/lib';
    }

    try {
        const result = execFileSync(
            'python3',
            [
                '-m',
                'bitsnark.core.sign_transactions',
                '--role',
                role.toLowerCase(),
                '--agent-id',
                agentId,
                '--setup-id',
                setupId
            ],
            { cwd: './python' }
        );
        console.log('done');
        console.log(result.toString());
    } catch (error: unknown) {
        const subprocessError = error as { status: number; stdout: Buffer; stderr: Buffer };
        console.error(
            `Python script failed with code ${subprocessError.status}\n` +
                `stdout:\n${subprocessError.stdout.toString()}\n` +
                `stderr:\n${subprocessError.stderr.toString()}\n`
        );
        throw error;
    }

    transactions = await readTemplates(agentId, setupId);
    for (const transaction of transactions) {
        if (transaction.transactionName == TransactionNames.PROOF_REFUTED) {
            console.warn('Manually skipping script generation for transaction', transaction.transactionName);
            continue;
        }
        if (!transaction.txId) throw new Error('Missing txId');
        if (role == AgentRoles.PROVER && !transaction.inputs.every((i) => i.proverSignature))
            throw new Error('Missing signature');
        if (role == AgentRoles.VERIFIER && !transaction.inputs.every((i) => i.verifierSignature))
            throw new Error('Missing signature');
    }

    return transactions;
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = await readTemplates(agentId, setupId);
    signTransactions(AgentRoles.PROVER, agentId, setupId, transactions).catch(console.error);
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
