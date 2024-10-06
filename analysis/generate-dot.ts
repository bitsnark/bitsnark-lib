import { TransactionNames, AgentRoles, twoDigits } from '../src/agent/common';
import { readTransactions } from '../src/agent/db';
import { Transaction, Input, findOutputByInput } from '../src/agent/transactions-new';

const TRANSACTION_SHAPE = 'box';
const INCOMING_FUNDS_SHAPE = 'oval';
const PYABLE_SHAPE = 'note';
const BISECTION_SHAPE = 'tripleoctagon';
const CONNECTOR_SHAPE = 'point';
const CONNECTOR_ARROWHEAD = 'none';

const PROVER_COLOR = 'green';
const VERIFIER_COLOR = 'blue';
const LOCKED_FUNDS_COLOR = 'magenta';
const BISECTION_COLOR = 'black';
const SYMBOLIC_OUTPUT_COLOR = 'gray';

const TIMEOUT_STYLE = 'dashed';

const LOCKED_FUNDS_OUTPUT_WEIGHT = 20;
const FIRST_SELECT_UNCONTESTED_WEIGHT = 100;
const VERTICAL_ALIGNMENT_WEIGHTS: { [key: string]: number } = {
    mainSteps: 30,
    stateUncontested: 1,
    selectUncontested: 0
};

const BISECTION_NAME = 'Bisection';

function dot(transactions: Transaction[], collapseBisection = false): string {

    // Sort by transaction ordinal and name for readability and consistency.
    transactions = transactions.sort((a, b) => (
        (a.ordinal && b.ordinal) && a.ordinal - b.ordinal || a.transactionName.localeCompare(b.transactionName)
    ));

    // Optionally collapse contention bisection section transactions.
    if (collapseBisection) transactions = transactions.reduce(
        (filteredTransactions: Transaction[], transaction) => {
            const match = transaction.transactionName.match(new RegExp(
                `^(${TransactionNames.STATE}|${TransactionNames.SELECT})(_[^0-9]*)([0-9]+)$`
            ));
            if (match) {
                const ordinal = parseInt(match[3], 10);

                // Remove all but the first state and state_uncontested transactions.
                if(transaction.transactionName.startsWith(TransactionNames.STATE) && ordinal > 0)
                    return filteredTransactions;


                if(transaction.transactionName.startsWith(TransactionNames.SELECT)) {

                    // Patch the first select transaction to represent the collapsed transactions.
                    if (transaction.transactionName === `${TransactionNames.SELECT}_00`) {
                        transaction.transactionName = BISECTION_NAME;
                    // Remove all remaining select and select_uncontested transactions except the last of each.
                    } else if (transactions.find(
                        transaction => transaction.transactionName === `${match[1]}${match[2]}${twoDigits(ordinal + 1)}`
                    )) return filteredTransactions;

                    // Patch the last select transaction to connect to the fake bisection transaction.
                    if (transaction.transactionName === `${TransactionNames.SELECT}_${twoDigits(ordinal)}`) {
                        transaction.inputs = transaction.inputs.map(input => (
                            {...input, transactionName: BISECTION_NAME}
                        ));
                    }
                }
            }

            return [...filteredTransactions, transaction];
        }, []
    );

    // Index transaction outputs to the transaction inputs that can spend them.
    const incomingOutputs: { [key: string]: [Transaction, Input][][] } = transactions.reduce(
        (incomingOutputs: { [key: string]: [Transaction, Input][][] }, transaction) => {
            transaction.inputs.forEach(input => {
                incomingOutputs[input.transactionName] ??= [];
                incomingOutputs[input.transactionName][input.outputIndex] ??= [];
                incomingOutputs[input.transactionName][input.outputIndex].push([transaction, input]);
            });
            return incomingOutputs;
        }, {}
    );

    function properties(properties: { [key: string]: string | number | undefined }): string {
        return `[${Object.entries(properties)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')}]`;
    }

    function transactionProperties(transaction: Transaction): string {
        let shape = TRANSACTION_SHAPE;
        if (transaction.transactionName === TransactionNames.LOCKED_FUNDS) shape = INCOMING_FUNDS_SHAPE;
        else if (transaction.transactionName === BISECTION_NAME) shape = BISECTION_SHAPE;
        else if (transaction.inputs.length === 0) shape = INCOMING_FUNDS_SHAPE;
        else if (!Object.keys(incomingOutputs).includes(transaction.transactionName)) shape = PYABLE_SHAPE;
        let color;
        if (transaction.transactionName === TransactionNames.LOCKED_FUNDS) color = LOCKED_FUNDS_COLOR;
        else if (transaction.transactionName === BISECTION_NAME) color = BISECTION_COLOR;
        else if (transaction.role === AgentRoles.PROVER) color = PROVER_COLOR;
        else if (transaction.role === AgentRoles.VERIFIER) color = VERIFIER_COLOR;
        return properties({shape, color, label: `"${transaction.transactionName.replace(/_/g, "\\n")}"`});
    }

    function transactionLine(transaction: Transaction): string {
        return `${transaction.transactionName} ${transactionProperties(transaction)}`;
    }

    function edgeProperties(
        transaction: Transaction, outputIndex: number, childTransaction?: Transaction, childInput?: Input
    ): string {
        let collectedProperties: { [key: string]: string | number | undefined } = {
            color: outputIndex > 0 ? SYMBOLIC_OUTPUT_COLOR: (
                transaction.transactionName === TransactionNames.LOCKED_FUNDS ? LOCKED_FUNDS_COLOR : undefined
            )
        };
        if (childTransaction && childInput) {
            if (childTransaction.transactionName === `${TransactionNames.SELECT_UNCONTESTED}_00`)
                collectedProperties.weight = FIRST_SELECT_UNCONTESTED_WEIGHT;
            const condition = transaction.outputs[outputIndex].spendingConditions[childInput.spendingConditionIndex];
            collectedProperties.color = collectedProperties.color ?? (
                condition.nextRole === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR);
            if (condition.timeoutBlocks) {
                collectedProperties = {
                    ...collectedProperties,
                    style: TIMEOUT_STYLE,
                    label: `"${condition.timeoutBlocks} blocks"`,
                };
            }
        } else collectedProperties = {
            ...collectedProperties,
            arrowhead: CONNECTOR_ARROWHEAD,
            weight: (
                transaction.transactionName === TransactionNames.LOCKED_FUNDS ? LOCKED_FUNDS_OUTPUT_WEIGHT : undefined
            )
        };
        return properties(collectedProperties);
    }

    function isMultiparousOutput(transaction: Transaction, outputIndex: number): boolean {
        return (
            incomingOutputs[transaction.transactionName] &&
            incomingOutputs[transaction.transactionName][outputIndex] &&
            incomingOutputs[transaction.transactionName][outputIndex].length > 1) || false;
    }

    function outputLine(transaction: Transaction, outputIndex: number): string[] {
        const isMulti = isMultiparousOutput(transaction, outputIndex);
        const connection = transaction.transactionName + (isMulti ? `_output_${outputIndex}` : '');

        return [
            ...(isMulti ? [
                `${connection} ${properties({shape: CONNECTOR_SHAPE})}`,
                `${transaction.transactionName} -> ${connection} ${edgeProperties(transaction, outputIndex)}`
            ] : []),
            ...((incomingOutputs[transaction.transactionName] &&
                 incomingOutputs[transaction.transactionName][outputIndex] &&
                 incomingOutputs[transaction.transactionName][outputIndex].map(
                    ([childTransaction, input]) => `${connection} -> ${childTransaction.transactionName} `
                        + `${edgeProperties(transaction, outputIndex, childTransaction, input)}`
                )
            ) ?? [])
        ];}

    function outputLines(transaction: Transaction): string[] {
        return transaction.outputs.flatMap((output, outputIndex) => outputLine(transaction, outputIndex));
    }

    function horizontalAlignmentLines(): string[] {
        return transactions.reduce((groups, transaction) => {
            if (transaction.inputs.length === 0) groups[0].push(transaction);
            else if (transaction.transactionName.match(/(state|select)_uncontested_00/)) groups[1].push(transaction);
            return groups;
        }, [[], []] as Transaction[][]).map((transactions) =>
            `{rank=same; ${transactions.map((transaction: Transaction) => transaction.transactionName).join('; ')}}`
        );
    }

    function verticalAlignmentLines(): string[] {
        const root = transactions.find(transaction => transaction.transactionName === TransactionNames.PROOF)!;
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
                transaction.transactionName === TransactionNames.PROOF_REFUTED ||
                transaction.transactionName === BISECTION_NAME
            ) collected.mainSteps.push(transaction);

            for(const output of incomingOutputs[transaction.transactionName] ?? [])
                for(const childTransaction of output)
                    queue.push(childTransaction[0]);
        }

        return Object.entries(collected).filter(([_, list]) => list.length > 1).map(
            ([name, list]) => list.map(transaction => transaction.transactionName).join(' -> ') +
                ` [style=invis; weight=${VERTICAL_ALIGNMENT_WEIGHTS[name]}]`
        );
    }

    return `digraph BitSnark {${['',
        ...transactions.map(transactionLine),
        ...horizontalAlignmentLines(),
        ...verticalAlignmentLines(),
        ...transactions.flatMap(outputLines),
        `${TransactionNames.LOCKED_FUNDS} -> ${TransactionNames.PROOF_UNCONTESTED} [style=invis]`,
    ].join('\n\t')}\n}`;
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = readTransactions(agentId, setupId).then(transactions => {
        console.log(dot(transactions, process.argv[2] === 'collapsed'));
    });
}
