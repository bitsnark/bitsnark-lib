import { bufferToBigint160 } from "../encoding/encoding";
import { Bitcoin, executeProgram } from "../generator/step3/bitcoin";
import { readTransactions } from "./db";
import { getSpendingConditionByInput, SignatureType, Transaction } from "./transactions-new";


export function emulateTransactionScripts(transactions: Transaction[]) {

    for (let transaction of transactions) {

        console.log(transaction.transactionName);

        for (let input of transaction.inputs) {

            console.log('input: ', input.index);

            const sc = getSpendingConditionByInput(transactions, input);
            if (!sc.wotsSpec || !sc.script || !sc.exampleWitness) continue;

            const bitcoin = new Bitcoin();
            bitcoin.throwOnFail = true;

            for (let b of sc.exampleWitness!.flat()) bitcoin.newStackItem(bufferToBigint160(b), 20);
            // add the sigs
            if (sc.signatureType == SignatureType.BOTH) {
                bitcoin.newStackItem(0n, 64);
                bitcoin.newStackItem(0n, 64);
            } else if (sc.signatureType == SignatureType.PROVER || sc.signatureType == SignatureType.VERIFIER) {
                bitcoin.newStackItem(0n, 64);
            }

            try {
                executeProgram(bitcoin, sc.script!, false);
            } catch (e) {
                console.error(e);
            }
        }
    }
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = await readTransactions(agentId, setupId);
    emulateTransactionScripts(transactions);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
