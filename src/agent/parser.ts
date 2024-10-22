import { AgentRoles } from "./common";
import { readTransactions } from "./db";
import { findOutputByInput, getSpendingConditionByInput } from "./transactions-new";
import { decodeWinternitz, WOTS_NIBBLES } from "./winternitz";

function hashesFromBuffer(data: Buffer): Buffer[] {
    const result: Buffer[] = [];
    for (let i = 0; i < data.length; i++) {
        result.push(data.subarray(i * 20, (i + 1) * 20));
    }
    return result;
}

export async function parseTransactionData(agentId: string, setupId: string, txId: string, data: Buffer): Promise<bigint[]> {

    const transactions = await readTransactions(agentId, setupId);
    const template = transactions.find(t => t.txId == txId);
    if (!template) throw new Error('Template not found');

    console.log('Parsing transaction: ', template.transactionName);

    const result: bigint[] = [];
    const hashes = hashesFromBuffer(data);
    let hashesIndex = 0;
    let resultIndex = 0;

    for (let inputIndex = 0; inputIndex < template.inputs.length; inputIndex++) {

        const input = template.inputs[inputIndex];
        const output = findOutputByInput(transactions, input);
        if (!output) throw new Error('Output not found');
        const sc = output.spendingConditions[input.spendingConditionIndex];
        if (!sc) throw new Error('Spending condition not found');
        if (!sc.wotsSpec) continue;
        if (!sc.wotsPublicKeys) throw new Error('Missing public keys');

        for (let i = 0; i < sc.wotsSpec.length; i++) {

            const spec = sc.wotsSpec[i];
            const keys = sc.wotsPublicKeys[i];
            const nibbleCount = WOTS_NIBBLES[spec];
            if (keys.length != nibbleCount)
                throw new Error('Wrong number of keys');
            // remove later
            if (sc.exampleWitness![i].length != nibbleCount)
                throw new Error('Wrong number of Values');
            result[resultIndex++] = decodeWinternitz(spec, hashes.slice(hashesIndex, hashesIndex + nibbleCount), keys)
            hashesIndex += nibbleCount;
        }
    }

    return result;
}

async function test(agentId: string, setupId: string, myRole: AgentRoles) {
    const transactions = (await readTransactions(agentId, setupId));

    for (const transaction of transactions) {

        if (transaction.role != myRole) continue;

        if (transaction.external) continue;
        let witness = Buffer.from([]);
        for (const input of transaction.inputs) {
            const sc = getSpendingConditionByInput(transactions, input);
            sc.exampleWitness?.forEach(ew => ew.forEach(eww => witness = Buffer.concat([witness, eww])));
        }
        const parsedData = await parseTransactionData(agentId, setupId, transaction.txId!, witness);
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    test('bitsnark_prover_1', 'test_setup', AgentRoles.PROVER);
}
