import { AgentRoles } from "./common";
import { readIncomingTransactions, readTemplates } from "./db";
import { Transaction, findOutputByInput } from "./transactions-new";
import { BitcoinNode } from "./bitcoin-node";
import { TransmittedTx } from "./setup-template";

interface Output {
    name: string; // Transaction name for easier debugging.
    outputIndex: number; // The index of the output in that transaction.
    requiredOutputBlocks?: number;
}

export interface TransactionOutputs {
    name: string; // For easier debugging.
    role: AgentRoles;
    mulableTxid: boolean;
    templateId: number;
    spentOutputs: Output[];
    createdOutputs: Output[];
}



// export interface Transmitted {
//     name: string,
//     blockHeight: number
// }

export class Protocol {
    private versions: Map<number, Map<string, TransactionOutputs>> = new Map();

    private getOutputsMap(transactions: Transaction[]): Map<string, TransactionOutputs> {
        return transactions.reduce(
            (outputsMap, transaction) => {
                outputsMap.set(transaction.transactionName, {
                    name: transaction.transactionName,
                    role: transaction.role,
                    templateId: transaction.templateId!,
                    mulableTxid: transaction.mulableTxid ?? false,
                    spentOutputs: transaction.inputs.map((input) => ({
                        name: input.transactionName,
                        outputIndex: input.outputIndex,
                        requiredOutputBlocks: findOutputByInput(transactions, input).spendingConditions[
                            input.spendingConditionIndex
                        ].timeoutBlocks
                    })),
                    createdOutputs: transaction.outputs.map((output, outputIndex) => ({
                        name: transaction.transactionName,
                        outputIndex: outputIndex
                    }))
                });
                if (transaction.transactionName === 'challenge') console.log('challenge', transaction);
                return outputsMap;
            },
            new Map() as Map<string, TransactionOutputs>
        );
    }

    getPublishableTransactions(
        version: number,
        currentHeight: number,
        transmitted: TransmittedTx[]
    ): string[] {

        const outputsMap = this.getVersion(version);
        if (!outputsMap) return [];

        const unspentOutputs = this.getUnspentOutputs(
            outputsMap,
            transmitted.map((tx) => tx.name)
        );

        return Array.from(outputsMap.entries())
            .filter(([name, outputs]) => {
                return (
                    //outputs.role === agentRole &&
                    transmitted.find((tx) => tx.name === name) === undefined &&
                    outputs.spentOutputs.every((output) =>
                        unspentOutputs.some(
                            (unspentOutput) => output.name === unspentOutput.name &&
                                output.outputIndex === unspentOutput.outputIndex &&
                                transmitted.find((transmittedTx) =>
                                    transmittedTx.name === output.name)!
                                    .blockHeight <=
                                currentHeight - (output.requiredOutputBlocks ?? 0)

                        )
                    )
                );
            })
            .map(([name, outputs]) => name);
    }


    getUnspentOutputs(outputsMap: Map<string, TransactionOutputs>, transmitted: string[]): Output[] {
        const [spent, created] = transmitted.reduce(
            ([spent, created], name) => {
                if (!outputsMap.has(name)) return [spent, created];
                return [
                    [...spent, ...outputsMap.get(name)!.spentOutputs],
                    [...created, ...outputsMap.get(name)!.createdOutputs]
                ];
            },
            [[], []] as [Output[], Output[]]
        );

        return created.filter(
            (output) =>
                !spent.some(
                    (spentOutput) =>
                        spentOutput.name === output.name && spentOutput.outputIndex === output.outputIndex
                )
        );
    }



    setVersion(version: number, transactions: Transaction[]) {
        this.versions.set(version, this.getOutputsMap(transactions));
    }

    getVersion(version: number): Map<string, TransactionOutputs> | undefined {
        return this.versions.get(version);
    }
}

if (__filename === process.argv[1]) {
    (async () => {
        const bitcoinNode = new BitcoinNode();
        const protocol = new Protocol();
        console.log(protocol.getVersion(1));
        const templates = await readTemplates('bitsnark_prover_1', 'test_setup');
        if (!templates) throw new Error('No templates found');
        if (templates[0].protocolVersion === undefined) throw new Error('Protocol version not set');
        protocol.setVersion(templates[0].protocolVersion, templates);
        // protocol.getVersion(templates[0].protocolVersion).map((tx) => console.log('Template:', tx));
        const listenTo = protocol.getPublishableTransactions(
            templates[0].protocolVersion,
            await bitcoinNode.getBlockCount(),
            await readIncomingTransactions('test_setup', 'bitsnark_prover_1'));

        listenTo.map((tx) => console.log('Listening to test_setup:', tx, templates[0].protocolVersion));

        // listenTo = protocol.getPublishableTransactions(
        //     templates[0].protocolVersion,
        //     await bitcoinNode.getBlockCount(),
        //     await readIncomingTransactions('test_493343', 'bitsnark_prover_1'));

        // listenTo.map((tx) => console.log('Listening to test_493343:', tx));

        // listenTo = protocol.getPublishableTransactions(
        //     templates[0].protocolVersion,
        //     await bitcoinNode.getBlockCount(),
        //     await readIncomingTransactions('test_526389', 'bitsnark_prover_1'));

        // listenTo.map((tx) => console.log('Listening to test_526389:', tx));
    })();
}
