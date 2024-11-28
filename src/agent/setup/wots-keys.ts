import {
    createUniqueDataId,
    getSpendingConditionByInput,
    getTransactionByName,
    Transaction,
    twoDigits
} from '../common/transactions';
import { AgentRoles, TransactionNames, iterations } from '../common/types';
import {
    encodeWinternitz,
    encodeWinternitz24,
    getWinternitzPublicKeys,
    getWinternitzPublicKeysDebug,
    WotsType
} from '../common/winternitz';
import { TransactionWithWotsKeys } from './messages';

export function setWotsPublicKeysForArgument(setupId: string, templates: Transaction[]) {
    const template = getTransactionByName(templates, TransactionNames.ARGUMENT);
    // there should be 5 inputs
    if (template.inputs.length != 5) throw new Error('Wrong number of inputs');
    // 0 is the index
    const input = template.inputs[0];
    const sc = getSpendingConditionByInput(templates, input);
    // there should be 7 wots keys
    if (sc.wotsSpec?.length != 7 || !sc.wotsSpec.every((spec) => spec == WotsType._24))
        throw new Error('Unexpected spec');

    const actualWotsKeys: Buffer[][] = [];

    // the first 6 should be the same keys as the selections, in order
    for (let i = 0; i < iterations; i++) {
        const selection = getTransactionByName(templates, TransactionNames.SELECT + '_' + twoDigits(i));
        if (selection.inputs.length != 1) throw new Error('Wrong number of inputs');
        const sc = getSpendingConditionByInput(templates, selection.inputs[0]);
        if (sc.wotsPublicKeys!.length != 1) throw new Error('Wrong number of keys');
        actualWotsKeys.push(sc.wotsPublicKeys![0]);
    }

    // the seventh is the existing one
    actualWotsKeys.push(sc.wotsPublicKeys![6]);
    sc.wotsPublicKeys = actualWotsKeys;
    input.wotsPublicKeys = sc.wotsPublicKeys;

    const argumentSelectionPath = [1n, 2n, 3n, 4n, 5n, 6n];
    sc.exampleWitness = argumentSelectionPath.map((n, i) =>
        encodeWinternitz24(n, createUniqueDataId(setupId, TransactionNames.SELECT + '_' + twoDigits(i), 0, 0, 0))
    );
    sc.exampleWitness[6] = encodeWinternitz24(123456n, createUniqueDataId(setupId, TransactionNames.ARGUMENT, 0, 0, 6));
}

export function generateWotsPublicKeys(setupId: string, templates: Transaction[], role: AgentRoles) {
    for (const template of templates) {
        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);

            if (sc.wotsSpec && sc.nextRole == role) {
                sc.wotsPublicKeys = sc.wotsSpec!.map((wt, dataIndex) =>
                    getWinternitzPublicKeys(
                        wt,
                        createUniqueDataId(
                            setupId,
                            template.transactionName,
                            input.outputIndex,
                            input.spendingConditionIndex,
                            dataIndex
                        )
                    )
                );
                sc.wotsSpec!.map((wt, dataIndex) =>
                    getWinternitzPublicKeys(
                        wt,
                        createUniqueDataId(
                            setupId,
                            template.transactionName,
                            input.outputIndex,
                            input.spendingConditionIndex,
                            dataIndex
                        )
                    )
                );
                input.wotsPublicKeys = sc.wotsPublicKeys;
                sc.wotsPublicKeysDebug = sc.wotsSpec!.map((wt, dataIndex) =>
                    getWinternitzPublicKeysDebug(
                        wt,
                        createUniqueDataId(
                            setupId,
                            template.transactionName,
                            input.outputIndex,
                            input.spendingConditionIndex,
                            dataIndex
                        )
                    )
                );

                sc.exampleWitness = sc.wotsSpec.map((spec, dataIndex) => {
                    return encodeWinternitz(
                        spec,
                        0n,
                        createUniqueDataId(
                            setupId,
                            template.transactionName,
                            input.outputIndex,
                            input.spendingConditionIndex,
                            dataIndex
                        )
                    );
                });
            }
        }
    }
}

export function mergeWots(role: AgentRoles, mine: Transaction[], theirs: TransactionWithWotsKeys[]): Transaction[] {
    const notNull = (t: Buffer[][] | undefined) => {
        if (!t) throw new Error('Null error');
        return t;
    };

    return mine.map((transaction, transactionIndex) => ({
        ...transaction,
        outputs: transaction.outputs.map((output, outputIndex) => ({
            ...output,
            spendingConditions: output.spendingConditions.map((sc, scIndex) => ({
                ...sc,
                wotsPublicKeys: !sc.wotsSpec
                    ? undefined
                    : sc.nextRole == role
                      ? notNull(sc.wotsPublicKeys)
                      : notNull(
                            theirs[transactionIndex].outputs[outputIndex].spendingConditions[scIndex].wotsPublicKeys
                        )
            }))
        }))
    }));
}
