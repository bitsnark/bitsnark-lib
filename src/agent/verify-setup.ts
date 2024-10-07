import { readTransaction } from "@bitauth/libauth";
import { readTransactions } from "./db";
import { TransactionNames } from "./common";

export async function verifySetup(agentId: string, setupId: string) {


    // read from db
    const transactions = await readTransactions(agentId, setupId);
    console.log('Loaded ', transactions.length, 'transactions');
    if (transactions.length < 85) {
        console.error('Not enough transactions found');
        return;
    }

    console.log('check that all outputs have taproot keys');
    const taprootCheck = !transactions.every(t => t.outputs.every(o => {
        if (!o.taprootKey) console.log('Missing taproot key', t, o);
        return o.taprootKey;
    }));
    if (taprootCheck) console.log('Fail');
    else console.log('Success');

    console.log('check that all outputs have amounts');
    const amountCheck = transactions
        .filter(t => t.transactionName != TransactionNames.CHALLENGE)
        .every(t => t.outputs.every(o => {
            if (!o.amount || o.amount <= 0n) console.log('Missing amount', t, o);
            return o.amount && o.amount > 0n;
        }));
    if (!amountCheck) console.log('Fail');
    else console.log('Success');
}


const scriptName = __filename;
if (process.argv[1] == scriptName) {
    verifySetup('bitsnark_prover_1', 'test_setup').catch(console.error);
}
