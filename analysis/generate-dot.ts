import { TransactionNames, AgentRoles } from '../src/agent/common';
import {
    Transaction, Input, getTransactionFileNames, loadTransactionFromFile, findOutputByInput
} from '../src/agent/transactions-new';

const TRANSACTION_SHAPE = 'note';
const PROVER_COLOR = 'green';
const VERIFIER_COLOR = 'blue';
const TIMEOUT_STYLE = 'dashed';
const DEFAULT_WEIGHT = 1;
const TIMEOUT_WEIGHT = 1;
const LOCKED_WEIGHT = 1;
const SELECT_AND_STATE_WEIGHT = 1;
const OUTPUT_NODE_PROPERTIES = {shape: 'point'};
const OUTPUT_EDGE_PROPERTIES = {weight: 1, arrowhead: 'none'};

function dot(transactions: Transaction[]): string {


    function properties(properties: { [key: string]: string | number | undefined }): string {
        return `[${Object.entries(properties)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')}]`;
    }

    function inputProperties(transaction: Transaction, input: Input): string {
        const output = findOutputByInput(transactions, input);
        const condition = output.spendingConditions[input.spendingConditionIndex];
        const style = condition.timeoutBlocks ? TIMEOUT_STYLE : undefined;
        let weight = DEFAULT_WEIGHT;
        let label;
        if (input.transactionName === TransactionNames.LOCKED_FUNDS) weight = LOCKED_WEIGHT;
        else if (condition.timeoutBlocks) {
            weight = TIMEOUT_WEIGHT;
            label = `"timelocked for ${condition.timeoutBlocks} blocks"`;

        } else {
            const stateOrSelectMatches = [transaction.transactionName, input.transactionName].map(
                name => name?.match(/^(select|state)_(\d{2})$/)).filter(Boolean);
            if (
                (stateOrSelectMatches[0]?.[1] === 'state' && stateOrSelectMatches[1]?.[1] === 'select') ||
                (stateOrSelectMatches[0]?.[1] === 'select' && stateOrSelectMatches[1]?.[1] === 'state')
            ) weight = SELECT_AND_STATE_WEIGHT;
        }
        return properties({ style, weight, label });
    }

    function inputLine(transaction: Transaction, input: Input): string {
        return `${input.transactionName}_output_${input.outputIndex} -> ${transaction.transactionName} ` +
            `${inputProperties(transaction, input)}`;
    }

    function outputLines(transaction: Transaction, outputIndex: number): string[] {
        return [
            `${transaction.transactionName}_output_${outputIndex} ${properties(OUTPUT_NODE_PROPERTIES)}`,
            `${transaction.transactionName} -> ${transaction.transactionName}_output_${outputIndex} ` +
                `${properties(OUTPUT_EDGE_PROPERTIES)}`
        ];
    }

    function transactionProperties(transaction: Transaction): string {
        return properties({
            shape: TRANSACTION_SHAPE,
            color: transaction.role === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR,
            label: `"${transaction.transactionName.replace(/_/g, "\\n")}"`
        });
    }

    function transactionLines(transaction: Transaction): string[] {
        return [
            `${transaction.transactionName} ${transactionProperties(transaction)}`,
            ...transaction.inputs.map(input => inputLine(transaction, input)),
            ...transaction.outputs.flatMap((_, outputIndex) => outputLines(transaction, outputIndex))
        ];
    }

    return `digraph BitSnark {${transactions.reduce((dot, transaction) => dot +
        `\n\t${transactionLines(transaction).join('\n\t')}`, '')}\n}`;
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const filenames = getTransactionFileNames('test_setup');
    const transactions = filenames.map(fn => loadTransactionFromFile('test_setup', fn));
    console.log(dot(transactions));
}
