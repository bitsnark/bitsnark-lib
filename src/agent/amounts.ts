import { AgentRoles, TransactionNames } from './common';
import { agentConf } from './agent.conf';
import { findOutputByInput, getTransactionByName, Transaction } from './transactions-new';
import { readTransactions, writeTransactions } from './db';

const externallyFundedTxs: string[] = [
    TransactionNames.LOCKED_FUNDS,
    TransactionNames.PROVER_STAKE,
    TransactionNames.CHALLENGE
];

// Currently only counting script sizes, not the actual transaction sizes.
// (Length input scripts + length of output scripts) / 8 bits per byte * fee per byte * fee factor percent / 100
// We add 1 satoshi to compensate for possible flooring by BigInt division.
function calculateTransactionFee(transaction: Transaction): bigint {
    const inputScriptsSize = transaction.inputs.reduce(
        (totalSize, input) => totalSize + (input.script?.length || 0), 0);
    const outputScriptsSize = transaction.outputs.reduce(
        (totalSize, output) => totalSize + output.spendingConditions.reduce(
            (totalSize, condition) => totalSize + (condition.script?.length || 0), 0), 0);
    const totalSize = Math.ceil((inputScriptsSize + outputScriptsSize) / 8);
    const requiredFee = BigInt(totalSize) * agentConf.feePerByte;
    const factoredFee = requiredFee * BigInt(agentConf.feeFactorPercent) / 100n;
    return factoredFee + 1n;
}

export async function addAmounts(agentId: string, agentRole: AgentRoles, setupId: string): Promise<Transaction[]> {

    let transactions = await readTransactions(agentId, setupId);

    function addAmounts(transaction: Transaction): Transaction {
        if (externallyFundedTxs.includes(transaction.transactionName)) return transaction;
        const amountlessOutputs = transaction.outputs.filter(output => !output.amount);
        if (amountlessOutputs.length == 0) return transaction;
        // If there are multiple undefined amounts, only the first carries the real value and the rest are symbolic.
        amountlessOutputs.slice(1).forEach(output => output.amount = agentConf.symbolicOutputAmount);

        const incomingAmount = transaction.inputs.reduce((totalValue, input) => {
            const output = findOutputByInput(transactions, input);
            if (!output.amount) addAmounts(getTransactionByName(transactions, input.transactionName));
            return totalValue + output.amount!;
        }, 0n);

        const existingOutputsAmount = transaction.outputs.reduce(
            (totalValue, output) => totalValue + (output.amount || 0n), 0n);

        amountlessOutputs[0].amount = incomingAmount - existingOutputsAmount - calculateTransactionFee(transaction);
        return transaction;
    }

    transactions = transactions.map(addAmounts);
    validateTransactionFees(transactions);
    await writeTransactions(agentId, agentRole, setupId, transactions);

    return transactions;
}

// This should probably be in a unit test.
export function validateTransactionFees(transactions: Transaction[]) {
    const totals = transactions.reduce((totals, t) => {
        if (t.outputs.some(output => !output.amount)) throw new Error(
            `Transaction ${t.transactionName} has undefined output amounts`);

        // Skip externally funded transactions for summing up fees.
        if (externallyFundedTxs.includes(t.transactionName)) return totals;

        const inputsValue = t.inputs.reduce(
            (totalValue, input) => totalValue + (findOutputByInput(transactions, input).amount || 0n), 0n);
        const outputsValue = t.outputs.reduce(
            (totalValue, output) => totalValue + (output.amount || 0n), 0n);
        const fee = inputsValue - outputsValue;
        const size = t.inputs.reduce(
            (totalSize, input) => totalSize + (input.script?.length || 0), 0
        ) + t.outputs.reduce(
            (totalSize, output) => totalSize + output.spendingConditions.reduce(
                (totalSize, condition) => totalSize + (condition.script?.length || 0), 0), 0);
        const requiredFee = calculateTransactionFee(t);

        if (inputsValue - outputsValue < 0) throw new Error(
            `Transaction ${t.transactionName} has negative value: ${inputsValue - outputsValue}`);
        if (inputsValue - outputsValue < requiredFee) throw new Error(
            `Transaction ${t.transactionName} has low fee: ${inputsValue - outputsValue - fee}`);
        return {
            size: totals.size + size,
            fee: totals.fee + fee
        };
    }, { size: 0, fee: 0n });

    if (totals.fee / BigInt(Math.ceil(totals.size / 8 / 100 * agentConf.feeFactorPercent)) != agentConf.feePerByte) {
        throw new Error(
            `Fee per byte is not correct: ` +
            `${totals.fee / BigInt(Math.ceil(totals.size / 8 / 100 * agentConf.feeFactorPercent))} ` +
            `!= ${agentConf.feePerByte}`);
    }
}


async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const role = process.argv[2] === 'bitsnark_prover_1' || !process.argv[2] ? AgentRoles.PROVER : AgentRoles.VERIFIER;
    const setupId = 'test_setup';
    await addAmounts(agentId, role, setupId);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
