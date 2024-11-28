import { Bitcoin, executeProgram } from '../../generator/btc_vm/bitcoin';
import { AgentDb } from '../common/db';
import { getSpendingConditionByInput, SignatureType, Transaction } from '../common/transactions';

export function emulateTransactionScripts(transactions: Transaction[]) {
    for (const transaction of transactions) {
        // if (transaction.transactionName != 'state_01') continue;
        console.log(transaction.transactionName);

        for (const input of transaction.inputs) {
            console.log('input: ', input.index);

            const sc = getSpendingConditionByInput(transactions, input);
            if (!sc.wotsSpec || !sc.script || !sc.exampleWitness) continue;

            const bitcoin = new Bitcoin();
            bitcoin.throwOnFail = true;

            for (const b of sc.exampleWitness!.flat()) bitcoin.newStackItem(b);
            // add the sigs
            if (sc.signatureType == SignatureType.BOTH) {
                bitcoin.newStackItem(Buffer.from(new Array(64)));
                bitcoin.newStackItem(Buffer.from(new Array(64)));
            } else if (sc.signatureType == SignatureType.PROVER || sc.signatureType == SignatureType.VERIFIER) {
                bitcoin.newStackItem(Buffer.from(new Array(64)));
            }

            try {
                executeProgram(bitcoin, sc.script!, false);
            } catch (e) {
                console.error(e);
                executeProgram(bitcoin, sc.script!, true);
            }
        }
    }
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);
    const transactions = await db.getTransactions(setupId);
    emulateTransactionScripts(transactions);
    db.disconnect();
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
