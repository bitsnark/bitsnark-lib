import { iterations, TransactionNames, twoDigits } from "../common/common";
import { getSpendingConditionByInput, getTransactionByName, Transaction } from "../common/transactions";
import { WotsType } from "../common/winternitz";

export async function setWotsPublicKeysForArgument(transactions: Transaction[]) {

    const template = getTransactionByName(transactions, TransactionNames.ARGUMENT);
    // there should be 5 inputs
    if (template.inputs.length != 5) throw new Error('Wrong number of inputs');
    // 0 is the index
    {
        const input = template.inputs[0];
        const sc = getSpendingConditionByInput(transactions, input);
        // there should be 7 wots keys
        if (sc.wotsSpec?.length != 7 ||
            !sc.wotsSpec.every(spec => spec == WotsType._24)) throw new Error('Unexpected spec');

        const actualWotsKeys: Buffer[][] = [];
        
        // the first 6 should be the same keys as the selections, in order
        for (let i = 0; i < iterations; i++) {
            const selection = getTransactionByName(transactions, TransactionNames.SELECT + '_' + twoDigits(i));
            if (selection.inputs.length != 1) throw new Error('Wrong number of inputs');
            const sc = getSpendingConditionByInput(transactions, selection.inputs[0]);
            if (sc.wotsPublicKeys!.length != 1) throw new Error('Wrong number of keys');
            actualWotsKeys.push(sc.wotsPublicKeys![0]);
        }

        // the seventh is the existing one
        actualWotsKeys.push(sc.wotsPublicKeys![6]);
        sc.wotsPublicKeys = actualWotsKeys;
    }
}
