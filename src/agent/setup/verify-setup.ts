import { AgentDb } from '../common/db';
import { getSpendingConditionByInput, SignatureType } from '../common/transactions';
import { AgentRoles, TransactionNames } from '../common/types';
import { decodeWinternitz } from '../common/winternitz';
import { validateTransactionFees } from './amounts';

export async function verifySetup(agentId: string, setupId: string, role: AgentRoles) {
    const db = new AgentDb(agentId);
    const transactions = await db.getTransactions(setupId);
    console.log('Loaded ', transactions.length, 'transactions');

    console.log('check that all outputs have taproot keys');
    const taprootCheck = !transactions.every((t) =>
        t.outputs.every((o) => {
            if (!o.taprootKey) console.log('Missing taproot key', t, o);
            return o.taprootKey;
        })
    );
    if (taprootCheck) console.log('Fail');
    else console.log('Success');

    console.log('check that all outputs have amounts');
    validateTransactionFees(transactions);
    const amountCheck = transactions
        .filter((t) => t.transactionName != TransactionNames.CHALLENGE)
        .every((t) =>
            t.outputs.every((o) => {
                if (!o.amount || o.amount <= 0n) console.log('Missing amount', t, o);
                return o.amount && o.amount > 0n;
            })
        );
    if (!amountCheck) console.log('Fail');
    else console.log('Success');

    console.log('check that all inputs have signatures');
    for (const transaction of transactions) {
        if (transaction.external || transaction.transactionName == TransactionNames.PROOF_REFUTED) {
            console.warn(`Not checking signatures for ${transaction.transactionName}`);
            continue;
        }

        for (const input of transaction.inputs) {
            const sc = getSpendingConditionByInput(transactions, input);
            const proverRequired = sc.signatureType === SignatureType.PROVER || sc.signatureType === SignatureType.BOTH;
            const verifierRequired =
                sc.signatureType === SignatureType.VERIFIER || sc.signatureType === SignatureType.BOTH;
            if (!input.proverSignature && proverRequired) {
                console.error(`Missing proverSignature for ${transaction.transactionName} input ${input.index}`);
                console.warn(input.proverSignature);
            }
            if (!input.verifierSignature && verifierRequired) {
                console.error(`Missing verifierSignature for ${transaction.transactionName} input ${input.index}`);
                console.warn(input.verifierSignature);
            }
        }
    }

    console.log('Check that all example witness parses correctly...');
    for (const transaction of transactions) {
        for (const input of transaction.inputs) {
            const sc = getSpendingConditionByInput(transactions, input);
            if (!sc.wotsSpec || sc.nextRole != role) continue;
            console.log(transaction.transactionName, input.index);
            if (!sc.exampleWitness) {
                console.log('example witness is missing');
                continue;
            }
            if (!sc.wotsPublicKeys) {
                console.log('public keys missing');
                continue;
            }
            let flag = true;
            for (let dataIndex = 0; dataIndex < sc.wotsSpec.length && flag; dataIndex++) {
                try {
                    decodeWinternitz(
                        sc.wotsSpec[dataIndex],
                        sc.exampleWitness![dataIndex],
                        sc.wotsPublicKeys![dataIndex]
                    );
                } catch (e) {
                    console.log(e);
                    flag = false;
                }
            }
            if (flag) console.log('OK');
        }
    }

    console.log('Success');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    verifySetup('bitsnark_prover_1', 'test_setup', AgentRoles.PROVER).catch(console.error);
}
