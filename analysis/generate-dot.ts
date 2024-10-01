import { TransactionNames, AgentRoles } from '../src/agent/common';
import { readTransactions } from '../src/agent/db';
import { Transaction, Input, findOutputByInput } from '../src/agent/transactions-new';

const TRANSACTION_SHAPE = 'note';
const PROVER_COLOR = 'green';
const VERIFIER_COLOR = 'blue';
const TIMEOUT_STYLE = 'dashed';
const OUTPUT_NODE_PROPERTIES = {shape: 'point'};
const OUTPUT_EDGE_PROPERTIES = {arrowhead: 'none'};
const LOCKED_FUNDS_OUTPUT_WEIGHT = 20;
const VERTICAL_ALIGNMENT_WEIGHTS: { [key: string]: number } = {
    mainSteps: 20,
    stateUncontested: 40,
    selectUncontested: 0
};

function dot(transactions: Transaction[]): string {

    const index: { [key: string]: [Transaction, Input][][] } = transactions.reduce(
        (index: { [key: string]: [Transaction, Input][][] }, transaction) => {
            transaction.inputs.forEach(input => {
                index[input.transactionName] ??= [];
                index[input.transactionName][input.outputIndex] ??= [];
                index[input.transactionName][input.outputIndex].push([transaction, input]);
            });
            return index;
        }, {});

    function properties(properties: { [key: string]: string | number | undefined }): string {
        return `[${Object.entries(properties)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')}]`;
    }

    function transactionProperties(transaction: Transaction): string {
        return properties({
            shape: TRANSACTION_SHAPE,
            color: transaction.role === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR,
            label: `"${transaction.transactionName.replace(/_/g, "\\n")}"`
        });
    }

    function transactionLine(transaction: Transaction): string {
        return `${transaction.transactionName} ${transactionProperties(transaction)}`;
    }

    function edgeProperties(
        transaction: Transaction, outputIndex: number, childTransaction: Transaction, childInput: Input
    ): string {
        const condition = transaction.outputs[outputIndex].spendingConditions[childInput.spendingConditionIndex];
        return properties({
            color: condition.nextRole === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR,
            style: condition.timeoutBlocks ? TIMEOUT_STYLE : undefined,
            label: condition.timeoutBlocks ? `"${condition.timeoutBlocks} blocks"` : undefined,
        });
    }

    function isMultiparousOutput(transaction: Transaction, outputIndex: number): boolean {
        return (
            index[transaction.transactionName] &&
            index[transaction.transactionName][outputIndex] &&
            index[transaction.transactionName][outputIndex].length > 1) || false;
    }

    function outputLine(transaction: Transaction, outputIndex: number): string[] {
        const isMulti = isMultiparousOutput(transaction, outputIndex);
        const connection = transaction.transactionName + (isMulti ? `_output_${outputIndex}` : '');
        return [
            ...(isMulti ? [
                `${connection} ${properties(OUTPUT_NODE_PROPERTIES)}`,
                `${transaction.transactionName} -> ${connection} ${properties({...OUTPUT_EDGE_PROPERTIES, weight: (
                    transaction.transactionName === TransactionNames.LOCKED_FUNDS ?
                        LOCKED_FUNDS_OUTPUT_WEIGHT : undefined
                )})}`] : []),
            ...((index[transaction.transactionName] && index[transaction.transactionName][outputIndex].map(
                ([childTransaction, input]) => `${connection} -> ${childTransaction.transactionName} `
                    + `${edgeProperties(transaction, outputIndex, childTransaction, input)}`)) ?? [])
        ];}

    function outputLines(transaction: Transaction): string[] {
        return transaction.outputs.flatMap((output, outputIndex) => outputLine(transaction, outputIndex));
    }

    function horizontalAlignmentLine(group: Transaction[], rank: string): string {
        return `{rank=${rank}; ${group.map(transaction => transaction.transactionName).join('; ')}}`;
    }

    function verticalAlignmentLine(transactions: Transaction[], weight: number): string {
        return transactions.map(transaction => transaction.transactionName).join(' -> ') +
            ` [style=invis; weight=${weight}]`;
    }

    function verticalAlignmentLines(root: Transaction): string[] {
        const collected: { [key: string]: Transaction[] } = {
            mainSteps: [], stateUncontested: [], selectUncontested: []};
        const visited: Set<string> = new Set();
        const queue: Transaction[] = [root];
        while(queue.length > 0) {
            const transaction = queue.shift()!;
            if (visited.has(transaction.transactionName)) continue;
            visited.add(transaction.transactionName);

            if (transaction.transactionName.startsWith(TransactionNames.STATE_UNCONTESTED))
                collected.stateUncontested.push(transaction);
            else if (transaction.transactionName.startsWith(TransactionNames.SELECT_UNCONTESTED))
                collected.selectUncontested.push(transaction);
            else if (
                transaction.transactionName === TransactionNames.PROOF ||
                transaction.transactionName.startsWith(TransactionNames.STATE) ||
                transaction.transactionName.startsWith(TransactionNames.SELECT) ||
                transaction.transactionName === TransactionNames.ARGUMENT ||
                transaction.transactionName === TransactionNames.PROOF_REFUTED
            ) collected.mainSteps.push(transaction);

            for(const output of index[transaction.transactionName] ?? [])
                for(const childTransaction of output)
                    queue.push(childTransaction[0]);
        }

        return Object.entries(collected).map(
            ([name, list]) => verticalAlignmentLine(list, VERTICAL_ALIGNMENT_WEIGHTS[name]));
    }

    function alignmentLines(): string[] {
        return [
            horizontalAlignmentLine(
                transactions.filter(transaction => transaction.inputs.length === 0), 'min'),
            ...verticalAlignmentLines(
                transactions.find(transaction => transaction.transactionName === TransactionNames.PROOF)!),
        ];
    }

    return `digraph BitSnark {${['',
        ...transactions.map(transactionLine),
        ...alignmentLines(),
        ...transactions.flatMap(outputLines)
    ].join('\n\t')}\n}`;
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = readTransactions(agentId, setupId).then(transactions => console.log(dot(transactions)));
}
