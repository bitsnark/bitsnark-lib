import { Bitcoin } from '../generator/step3/bitcoin';
import { encodeWinternitz1, encodeWinternitz24, encodeWinternitz256, getWinternitzPublicKeys, WotsType } from './winternitz';
import { iterations, random, TransactionNames } from './common';
import { bufferToBigint160 } from "../encoding/encoding";
import { StackItem } from '../generator/step3/stack';
import { SimpleTapTree } from './simple-taptree';
import { agentConf } from './agent.conf';
import { Buffer } from 'node:buffer';
import { findOutputByInput, getTransactionByName, Input, Output, SpendingCondition, Transaction } from './transactions-new';
import { generateFinalStepTaproot } from './final-step/generate';
import { readTransactions, writeTransaction, writeTransactions } from './db';

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
                if (inputs.length && inputs[0].script) scripts.push(inputs[0].script!);
            });
            if (!output.taprootKey && scripts && scripts.length > 0) {
                const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
                output.taprootKey = stt.getScriptPubkey();
            }
        });
    });
}

function generateBoilerplate(setupId: string, transactionName: string, outputIndex: number, scIndex: number, spendingCondition: SpendingCondition): Buffer {
    const bitcoin = new Bitcoin();
    bitcoin.setDefaultHash('HASH160');

    if (spendingCondition.signaturesPublicKeys) {
        spendingCondition.signaturesPublicKeys.forEach(key => {
            bitcoin.verifySignature(key);
        });
    }

    if (spendingCondition.timeoutBlocks) {
        bitcoin.checkTimeout(spendingCondition.timeoutBlocks);
    }

    if (spendingCondition.wotsSpec) {

        spendingCondition.exampleWitness = [];

        spendingCondition.wotsSpec.forEach((spec, dataIndex) => {

            if (spec == WotsType._256) {
                bitcoin.winternitzCheck256(
                    spendingCondition.wotsPublicKeys![dataIndex].map(_ => bitcoin.addWitness(0n)),
                    spendingCondition.wotsPublicKeys![dataIndex].map(b => bufferToBigint160(b))
                );
                spendingCondition.exampleWitness!.push(
                    encodeWinternitz256(random(32), [setupId, transactionName, outputIndex, scIndex, dataIndex].toString()));
            } else if (spec == WotsType._24) {
                bitcoin.winternitzCheck24(
                    spendingCondition.wotsPublicKeys![dataIndex].map(_ => bitcoin.addWitness(0n)),
                    spendingCondition.wotsPublicKeys![dataIndex].map(b => bufferToBigint160(b))
                );
                spendingCondition.exampleWitness!.push(
                    encodeWinternitz24(random(3), [setupId, transactionName, outputIndex, scIndex, dataIndex].toString()));
            } else {
                bitcoin.winternitzCheck1(
                    spendingCondition.wotsPublicKeys![dataIndex].map(_ => bitcoin.addWitness(0n)),
                    spendingCondition.wotsPublicKeys![dataIndex].map(b => bufferToBigint160(b))
                );
                spendingCondition.exampleWitness!.push(
                    encodeWinternitz1(random(1) % 7n, [setupId, transactionName, outputIndex, scIndex, dataIndex].toString()));
            }
        });
    }

    return bitcoin.programToBinary();
}

function generateSemiFinalScript(lastSelectOutput: Output, semiFinalInput: Input) {
    const bitcoin = new Bitcoin();
    bitcoin.setDefaultHash('HASH160');

    const pubKeys = lastSelectOutput.spendingConditions[0].wotsPublicKeys!;

    const indexNibbles: StackItem[] = pubKeys[0].map(_ => bitcoin.addWitness(0n));

    const pathWitness: StackItem[][] = [];
    for (let i = 0; i < iterations; i++) {
        pathWitness[i] = pubKeys[i + 1].map(_ => bitcoin.addWitness(0n));
    }

    const pathNibbles: StackItem[] = [];
    for (let i = 0; i < iterations; i++) {
        const result = bitcoin.newStackItem();
        pathNibbles.push(result);
        bitcoin.winternitzDecode1(
            result,
            pathWitness[i],
            pubKeys[i + 1].map(b => bufferToBigint160(b))
        );
    }

    bitcoin.checkSemiFinal(pathNibbles, indexNibbles, iterations);

    lastSelectOutput.spendingConditions[0].script = bitcoin.programToBinary();
    semiFinalInput.script = bitcoin.programToBinary();
}

export async function generateAllScripts(
    agentId: string, setupId: string, transactions: Transaction[]
): Promise<Transaction[]> {

    // generate wots keys where they are missing, in case we're not really in a setup process
    transactions.forEach(t => {
        t.outputs.forEach((output, outputIndex) => {
            output.spendingConditions.forEach((sc, scIndex) => {
                if (sc.wotsSpec && !sc.wotsPublicKeys) {
                    sc.wotsPublicKeys = sc.wotsSpec!
                        .map((wt, dataIndex) => getWinternitzPublicKeys(
                            wt,
                            [setupId, t.transactionName, outputIndex, scIndex, dataIndex].toString()));
                }
            });
        });
    });

    transactions.forEach(t => {

        console.log('transaction name: ', t.transactionName);

        if (t.transactionName == TransactionNames.PROOF_REFUTED) {
            const taproot = generateFinalStepTaproot(setupId, transactions);
            const semi_final = getTransactionByName(transactions, TransactionNames.ARGUMENT);
            semi_final.outputs[0].taprootKey = taproot;
        } else if (t.transactionName == TransactionNames.ARGUMENT) {
            const prevOutput = findOutputByInput(transactions, t.inputs[0]);
            generateSemiFinalScript(prevOutput, t.inputs[0]);
        } else {
            t.inputs.forEach(input => {
                const prev = getTransactionByName(transactions, input.transactionName);
                const sc = prev.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
                const script = generateBoilerplate(setupId, t.transactionName, input.outputIndex, input.spendingConditionIndex, sc);
                sc.script = script;
                input.script = script;
            });
        }
    });

    // generate the taproot key for all outputs except in the semi-final tx
    setTaprootKey(transactions);

    await writeTransactions(agentId, setupId, transactions);

    return transactions;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = await readTransactions(agentId, setupId);
    await generateAllScripts(agentId, 'test_setup', transactions);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
