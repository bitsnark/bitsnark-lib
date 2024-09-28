import { AgentRoles } from '../src/agent/common';
import {
    TransactionNames, Transaction, Input,
    getTransactionFileNames, loadTransactionFromFile,
    findOutputByInput
} from '../src/agent/transactions-new';

const TRANSACTION_SHAPE = 'note';
const PROVER_COLOR = 'green';
const VERIFIER_COLOR = 'blue';
const TIMEOUT_STYLE = 'dashed';
const DEFAULT_WEIGHT = 6;
const PAYLOAD_WEIGHT = 1;
const TIMEOUT_WEIGHT = 2;
const SELECT_AND_STATE_WEIGHT = 12;
const FLOW_PLACEHOLDER = '/* Flow. */';
const DOT_TEMPLATE = `
digraph BitSnark {
    ${FLOW_PLACEHOLDER}
}`.trim();

function dot(transactions: Transaction[]): string {

    function properties(properties: { [key: string]: string | number | undefined }): string {
        return `[${Object.entries(properties)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')}]`;
    }

    function nodeProperties(transaction: Transaction): string {
        return properties({
            shape: TRANSACTION_SHAPE,
            color: transaction.role === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR
        });
    }

    function nodeLine(transaction: Transaction) {
        return `\t${transaction.transactionName} ${nodeProperties(transaction)}`;
    }

    function edgeProperties(input: Input, transaction: Transaction): string {
        const output = findOutputByInput(transactions, input);
        const condition = output.spendingConditions[input.spendingConditionIndex];
        const style = condition.timeoutBlocks ? TIMEOUT_STYLE : undefined;
        let weight = DEFAULT_WEIGHT;
        if (input.transactionName === TransactionNames.PAYLOAD) weight = PAYLOAD_WEIGHT;
        else if (condition.timeoutBlocks) weight = TIMEOUT_WEIGHT;
        else {
            const stateOrSelectMatches = [transaction.transactionName, input.transactionName].map(
                name => name?.match(/^(select|state)_(\d{2})$/)).filter(Boolean);
            if (
                (stateOrSelectMatches[0]?.[1] === 'state' && stateOrSelectMatches[1]?.[1] === 'select') ||
                (stateOrSelectMatches[0]?.[1] === 'select' && stateOrSelectMatches[1]?.[1] === 'state')
            ) weight = SELECT_AND_STATE_WEIGHT;
        }
        return properties({ style, weight });
    }

    function edgeLine(input: Input, transaction: Transaction) {
        return `\t${input.transactionName} -> ${transaction.transactionName} ${edgeProperties(input, transaction)}`;
    }

    return DOT_TEMPLATE.replace(FLOW_PLACEHOLDER, transactions.reduce((dot, t) => dot + [
        '',
        nodeLine(t),
        ...t.inputs.map(i => edgeLine(i, t))
    ].join("\n"), ''));
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const filenames = getTransactionFileNames('test_setup');
    const transactions = filenames.map(fn => loadTransactionFromFile('test_setup', fn));
    console.log(dot(transactions));
}
