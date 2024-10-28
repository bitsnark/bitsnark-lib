import { AgentRoles } from './common';
import { readTransactions, readTransmittedTransactions } from './db';
import { Transaction, getTransactionByName, findOutputByInput } from './transactions-new';

// All of this should come from agent.conf
const setupId = 'test_setup';
//const agentId = 'bitsnark_prover_1';
//const agentRole = AgentRoles.PROVER;
const agentId = 'bitsnark_verifier_1';
const agentRole = AgentRoles.VERIFIER;

interface Output {
    name?: string;  // For easier debugging.
    transactionId: string;
    outputIndex: number;
    requiredOutputBlocks?: number;
}

interface TransactionOutputs {
    name?: string;  // For easier debugging.
    role: AgentRoles;
    spentOutputs: Output[];
    createdOutputs: Output[];
}

// Inputs are missing the transactionId field, which isn't updated when txId's are computed.
function fixTransactionInputs(transactions: Transaction[]): Transaction[] {
    return transactions.map(transaction => ({
        ...transaction,
        inputs: transaction.inputs.map(input => ({
            ...input,
            transactionId: input.transactionName ?
                getTransactionByName(transactions, input.transactionName).txId : undefined
        }))
    }));
}

function getOutputsMap(transactions: Transaction[]): Map<string, TransactionOutputs> {
    return fixTransactionInputs(transactions).reduce((outputsMap, transaction) => {
        if (transaction.external) return outputsMap;
        outputsMap.set(transaction.txId!, {
            name: transaction.transactionName,
            role: transaction.role,
            spentOutputs: transaction.inputs.map(input => ({
                name: input.transactionName,
                transactionId: input.transactionId!,
                outputIndex: input.outputIndex,
                requiredOutputBlocks: findOutputByInput(transactions, input)
                    .spendingConditions[input.spendingConditionIndex].timeoutBlocks
            })),
            createdOutputs: transaction.outputs.map((output, outputIndex) => ({
                name: transaction.transactionName,
                transactionId: transaction.txId!,
                outputIndex: outputIndex
            }))
        });
        return outputsMap;
    }, new Map() as Map<string, TransactionOutputs>);
}

function getUnspentOutputs(outputsMap: Map<string, TransactionOutputs>, transmitted: string[]): Output[] {
    const [spent, created] = transmitted.reduce(([spent, created], transactionId) => {
        if (!outputsMap.has(transactionId)) return [spent, created];
        return [
            [...spent, ...outputsMap.get(transactionId)!.spentOutputs],
            [...created, ...outputsMap.get(transactionId)!.createdOutputs]
        ];
    }, [[], []] as [Output[], Output[]]);

    return created.filter(output => !spent.some(spentOutput =>
        spentOutput.transactionId === output.transactionId &&
        spentOutput.outputIndex === output.outputIndex
    ));
}

async function getPublishableTransactions(
    setupId: string, outputsMap: Map<string, TransactionOutputs>, currentHeight: number
): Promise<string[]> {
    const transmitted = await readTransmittedTransactions(setupId);
    const unspentOutputs = getUnspentOutputs(outputsMap, transmitted.map(transmittedTx => transmittedTx.txId));
    return Array.from(outputsMap.entries()).filter(([txId, outputs]) => {
        return outputs.role === agentRole && outputs.spentOutputs.every(output => unspentOutputs.some(unspentOutput =>
            output.transactionId === unspentOutput.transactionId &&
            output.outputIndex === unspentOutput.outputIndex &&
            transmitted.find(
                transmittedTx => transmittedTx.txId === output.transactionId
            )!.blockHeight >= (currentHeight - (output.requiredOutputBlocks ?? 0))
        ));
    }).map(([txId, outputs]) => txId);
}

export async function execute(agentId: string, setupId: string, outputsMap?: Map<string, TransactionOutputs>) {
    if (!outputsMap) outputsMap = getOutputsMap(await readTransactions(agentId, setupId));
    const currentHeight = 0;  // TODO: Get current height from our node.
    console.warn('Only getting publishable transactions for now');
    return getPublishableTransactions(setupId, outputsMap, currentHeight);
}

async function main() {
    const transactions = await readTransactions(agentId, setupId);
    const outputsMap = getOutputsMap(transactions);
    setInterval(async () => {
        console.debug((await execute(agentId, setupId, outputsMap)).map(txId => outputsMap.get(txId)!.name));
    }, 1000);
}

main().then(() => console.log('Launching protocol execution')).catch(console.error);
