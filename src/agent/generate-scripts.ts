import { findOutputByInput, getTransactionByName, Input, iterations, loadAllTransactionsFromFiles, Output, SpendingCondition, Transaction, writeTransactionToFile } from './transactions-new';
import { Bitcoin } from '../generator/step3/bitcoin';
import { WotsType } from './winternitz';
import { bufferToBigint160 } from './common';
import { StackItem } from '../generator/step3/stack';

function generateBoilerplate(spendingCondition: SpendingCondition): Buffer {
    const bitcoin = new Bitcoin();

    if (spendingCondition.signaturesPublicKeys) {
        spendingCondition.signaturesPublicKeys.forEach(key => {
            bitcoin.verifySignature(key);
        });
    }

    if (spendingCondition.wotsSpec) {
        spendingCondition.wotsSpec.forEach((spec, index) => {
            if (spec == WotsType._1) {
                bitcoin.winternitzCheck1(
                    spendingCondition.wotsPublicKeys![index].map(_ => bitcoin.addWitness(0n)),
                    spendingCondition.wotsPublicKeys![index].map(b => bufferToBigint160(b))
                );
            } else if (spec == WotsType._256) {
                bitcoin.winternitzCheck256(
                    spendingCondition.wotsPublicKeys![index].map(_ => bitcoin.addWitness(0n)),
                    spendingCondition.wotsPublicKeys![index].map(b => bufferToBigint160(b))
                );
            }
        });
    }

    return bitcoin.programToBinary();
}

function generateSemiFinalScript(lastSelectOutput: Output, semiFinalInput: Input) {
    const bitcoin = new Bitcoin();

    const pubKeys = lastSelectOutput.spendingConditions[0].wotsPublicKeys!;

    const pathWitness: StackItem[][] = [];
    for (let i = 0; i < iterations; i++) {
        pathWitness[i] = pubKeys[i].map(_ => bitcoin.addWitness(0n));
    }

    const indexNibbles: StackItem[] = pubKeys[pubKeys.length - 1].map(_ => bitcoin.addWitness(0n));

    const pathNibbles: StackItem[] = [];
    for (let i = 0; i < iterations; i++) {
        const result = bitcoin.newStackItem();
        pathNibbles.push(result);
        bitcoin.winternitzDecode1(
            result,
            pathWitness[i],
            pubKeys[i].map(b => bufferToBigint160(b))
        );
    }

    bitcoin.checkSemiFinal(pathNibbles, indexNibbles, iterations);

    lastSelectOutput.spendingConditions[0].script = bitcoin.programToBinary();
    semiFinalInput.script = bitcoin.programToBinary();
}

export function generateAllScripts(setupId: string, transactions: Transaction[]) {

    transactions.forEach(t => {
        if (t.transactionName == 'semi-final') {
            const prevOutput = findOutputByInput(transactions, t.inputs[0]);
            generateSemiFinalScript(prevOutput, t.inputs[0]);
        } else if (t.transactionName == 'final') {

        } else {
            t.inputs.forEach(input => {
                const prev = getTransactionByName(transactions, input.transactionName);
                const sc = prev.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
                const script = generateBoilerplate(sc);
                sc.script = script;
                input.script = script;
            });
        }

        writeTransactionToFile(setupId, t);
    });
}

var scriptName = __filename;
if (process.argv[1] == scriptName) {
    const transactions = loadAllTransactionsFromFiles('test_setup');
    generateAllScripts('test_setup', transactions);
}
