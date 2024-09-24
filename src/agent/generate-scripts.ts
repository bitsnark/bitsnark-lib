import { findOutputByInput, getTransactionByName, Input, iterations, loadAllTransactionsFromFiles, Output, SpendingCondition, Transaction, writeTransactionToFile } from './transactions-new';
import { Bitcoin } from '../generator/step3/bitcoin';
import { WotsType } from './winternitz';
import { bufferToBigint160 } from './common';
import { StackItem } from '../generator/step3/stack';
import { SimpleTapTree } from './simple-taptree';
import { agentConf } from '../../agent.conf';
import { Buffer } from 'node:buffer';

function findInputsByOutput(
    transactions: Transaction[],
    transactionName: string,
    outputIndex: number,
    spendingConditionIndex: number): Input[] {
    return transactions.map(t => t.inputs
        .filter(i => i.transactionName == transactionName &&
            i.outputIndex == outputIndex &&
            i.spendingConditionIndex == spendingConditionIndex))
        .flat();
}

function setTaprootKey(transactions: Transaction[]) {
    transactions.forEach(t => {
        t.outputs.forEach((output, outputIndex) => {
            const scripts: Buffer[] = [];
            output.spendingConditions.forEach((sc, scIndex) => {
                const inputs = findInputsByOutput(transactions, t.transactionName, outputIndex, scIndex);
                if (inputs.some(ti => ti.script!.compare(inputs[0].script! as any) != 0)) {
                    console.error(inputs);
                    throw new Error('Different scripts for one SC');
                }
                if (inputs.length == 0)
                    throw new Error('No input for this SC?');

                scripts.push(inputs[0].script!);
            });
            const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
            output.taprootKey = stt.getAddress();
        });
    });
}

function generateBoilerplate(spendingCondition: SpendingCondition): Buffer {
    const bitcoin = new Bitcoin();
    bitcoin.setDefaultHash('HASH160');

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
    bitcoin.setDefaultHash('HASH160');

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

    setTaprootKey(transactions);

    transactions.forEach(t => {
        writeTransactionToFile(setupId, t);
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const transactions = loadAllTransactionsFromFiles('test_setup');
    generateAllScripts('test_setup', transactions);
}
