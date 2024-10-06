import { readTransaction } from "@bitauth/libauth";
import { readTransactions } from "./db";

export async function verifySetup(agentId: string, setupId: string) {


    // read from db
    const transactions = await readTransactions(agentId, setupId);
    console.log('Loaded ', transactions.length, 'transactions');
    if (transactions.length < 85) {
        console.error('Not enough transactions found');
        return;
    }

    // check that all inputs correspond to valid outputs

    // check that all spending conditions have scripts

    console.log('check that all spending conditions have wots keys');
    if (!transactions.every(t => t.outputs.every(o => o.spendingConditions.every(sc => {
        if (sc.wotsSpec && !sc.wotsPublicKeys) console.log('No wots keys', t, o, sc);
        return sc.wotsSpec ? !!sc.wotsPublicKeys : true;
    })))) console.log('Fail');
    else console.log('Success');

    console.log('check that all outputs have taproot keys');
    if (!transactions.every(t => t.outputs.every(o => {
        if (!o.taprootKey) console.log('Missing taproot key', t, o);
        return o.taprootKey;
    }))) console.log('Fail');
    else console.log('Success');
}


const scriptName = __filename;
if (process.argv[1] == scriptName) {
    verifySetup('bitsnark_prover_1', 'test_setup').catch(console.error);
}
