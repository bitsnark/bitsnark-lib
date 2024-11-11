import { readTemplates } from "./db";
import { TransactionNames } from "./common";
import { getSpendingConditionByInput, SignatureType } from "./transactions-new";

export async function verifySetup(agentId: string, setupId: string) {
    // read from db
    const transactions = await readTemplates(agentId, setupId);
    console.log('Loaded ', transactions.length, 'transactions');

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

    console.log('check that all inputs have signatures');
    const sigCheck = transactions
        .every(t => t.inputs.every(input => {

            if (t.external ||
                t.transactionName == TransactionNames.PROOF_REFUTED) return true;

            const sc = getSpendingConditionByInput(transactions, input);
            if ((sc.signatureType == SignatureType.PROVER ||
                sc.signatureType == SignatureType.BOTH) && !input.proverSignature) {
                console.log('Missing signature', t, input);
                return false;
            } else if ((sc.signatureType == SignatureType.VERIFIER ||
                sc.signatureType == SignatureType.BOTH) && !input.proverSignature) {
                console.log('Missing signature', t, input);
                return false;
            }
            return true;
        }));
    if (!sigCheck) console.log('Fail');
    else console.log('Success');

    transactions.forEach(t => {
        let total = 0;
        t.inputs.forEach(i => total += i.script?.length ?? 0);
        console.log(`${t.transactionName}: ${total}`);
    });

}


const scriptName = __filename;
if (process.argv[1] == scriptName) {
    verifySetup('bitsnark_prover_1', 'test_setup').catch(console.error);
}
