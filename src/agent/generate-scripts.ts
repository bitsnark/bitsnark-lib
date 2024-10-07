import { Bitcoin } from '../generator/step3/bitcoin';
import { encodeWinternitz1, encodeWinternitz24, encodeWinternitz256, getWinternitzPublicKeys, WotsType } from './winternitz';
import { iterations, random, TransactionNames } from './common';
import { bufferToBigint160 } from "../encoding/encoding";
import { StackItem } from '../generator/step3/stack';
import { SimpleTapTree } from './simple-taptree';
import { agentConf } from './agent.conf';
import { Buffer } from 'node:buffer';
import { findOutputByInput, getTransactionByName, Input, Output, SpendingCondition, Transaction } from './transactions-new';
import { readTransactions, writeTransactions } from './db';
import { generateFinalStepTaproot } from './final-step/generate';

const DEAD_SCRIPT = Buffer.from([0x6a]); // opcode fails transaction

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
    for (const t of transactions) {
        for (let outputIndex = 0; outputIndex < t.outputs.length; outputIndex++) {
            const output = t.outputs[outputIndex];
            if (output.taprootKey) continue;
            const scripts = output.spendingConditions.map((sc, scIndex) => {
                const inputs = findInputsByOutput(transactions, t.transactionName, outputIndex, scIndex);
                return inputs.length && inputs[0].script ? inputs[0].script : DEAD_SCRIPT;
            });
            const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
            output.taprootKey = stt.getScriptPubkey();
        };
    };
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

        const keys = spendingCondition.wotsPublicKeys!
            .map(keys => keys.map(b => bufferToBigint160(b)));

        const encoders = {
            [WotsType._256]: (dataIndex: number) => 
                encodeWinternitz256(random(32), [setupId, transactionName, outputIndex, scIndex, dataIndex].toString()),
            [WotsType._24]: (dataIndex: number) => 
                encodeWinternitz24(random(3), [setupId, transactionName, outputIndex, scIndex, dataIndex].toString()),
            [WotsType._1]: (dataIndex: number) => 
                encodeWinternitz1(random(1) % 7n, [setupId, transactionName, outputIndex, scIndex, dataIndex].toString())
        };
        spendingCondition.exampleWitness = spendingCondition.wotsSpec
            .map((spec, dataIndex) => encoders[spec](dataIndex));

        const witnessSIs = spendingCondition.exampleWitness
            .map(values => values.map(v => bitcoin.addWitness(bufferToBigint160(v))));

        const decoders = {
            [WotsType._256]: (dataIndex: number) => 
                bitcoin.winternitzCheck256(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._24]: (dataIndex: number) => 
                bitcoin.winternitzCheck24(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._1]: (dataIndex: number) => 
                bitcoin.winternitzCheck1(witnessSIs[dataIndex], keys[dataIndex]),
        };
        spendingCondition.wotsSpec.forEach((spec, dataIndex) => decoders[spec](dataIndex));
    }

    return bitcoin.programToBinary();
}

function generateSemiFinalScript(lastSelectOutput: Output): Buffer {
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

    return bitcoin.programToBinary();
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

    for (const t of transactions) {

        console.log('transaction name: ', t.transactionName);

        if (t.transactionName == TransactionNames.PROOF_REFUTED) {
            const taproot = generateFinalStepTaproot(setupId, transactions);
            const semi_final = getTransactionByName(transactions, TransactionNames.ARGUMENT);
            if (semi_final.outputs.length != 1)
                throw new Error('Wrong number of outputs');
            semi_final.outputs[0].taprootKey = taproot;
        } else if (t.transactionName == TransactionNames.ARGUMENT) {
            if (t.inputs.length != 1)
                throw new Error('Wrong number of inputs');
            const prevOutput = findOutputByInput(transactions, t.inputs[0]);
            if (prevOutput.spendingConditions.length < 1)
                throw new Error('Wrong number of spending conditions');
            const script = generateSemiFinalScript(prevOutput);
            prevOutput.spendingConditions[0].script = script;
            t.inputs[0].script = script;
        } else {
            for (const input of t.inputs) {
                const prevOutput = findOutputByInput(transactions, input);
                const sc = prevOutput.spendingConditions[input.spendingConditionIndex];
                const script = generateBoilerplate(setupId, t.transactionName, input.outputIndex, input.spendingConditionIndex, sc);
                sc.script = script;
                input.script = script;
            };
        }
    };

    // copy scripts from spending conditions to matching inputs
    for (const transaction of transactions) {
        if (transaction.transactionName == TransactionNames.PROOF_REFUTED) continue;
        for (const input of transaction.inputs) {
            const prev = getTransactionByName(transactions, input.transactionName);
            if (!prev || input.outputIndex >= prev.outputs.length)
                throw new Error("Input doesn't match any outputs");
            const output = prev.outputs[input.outputIndex];
            const spendingCondition = output.spendingConditions[input.spendingConditionIndex];
            if (!spendingCondition)
                throw new Error("Input doesn't match any spending conditions");
            if (!spendingCondition.script)
                throw new Error('Script in spending condition is missing');
            input.script = spendingCondition.script;
        }
    }

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
