import { Bitcoin } from '../generator/step3/bitcoin';
import { WotsType } from './winternitz';
import { bufferToBigint160, iterations } from './common';
import { StackItem } from '../generator/step3/stack';
import { SimpleTapTree } from './simple-taptree';
import { agentConf } from '../../agent.conf';
import { Buffer } from 'node:buffer';
import { TransactionNames, findOutputByInput, getTransactionByName, getTransactionFileNames, Input, loadTransactionFromFile, Output, SpendingCondition, Transaction, writeTransactionToFile } from './transactions-new';
import { generateFinalStepTaproot } from './final-step/generate';

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
                output.taprootKey = stt.getAddress();
            }
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

        if (t.transactionName == 'final') {
            const taproot = generateFinalStepTaproot(setupId, transactions);
            const semi_final = getTransactionByName(transactions, TransactionNames.SEMI_FINAL);
            semi_final.outputs[0].taprootKey = taproot;
        } else if (t.transactionName == 'semi-final') {
            const prevOutput = findOutputByInput(transactions, t.inputs[0]);
            generateSemiFinalScript(prevOutput, t.inputs[0]);
        } else {
            t.inputs.forEach(input => {
                const prev = getTransactionByName(transactions, input.transactionName);
                const sc = prev.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
                const script = generateBoilerplate(sc);
                sc.script = script;
                input.script = script;
            });
        }
    });

    // generate the taproot key for all outputs except in the semi-final tx
    setTaprootKey(transactions);

    transactions.forEach(t => {
        writeTransactionToFile(setupId, t);
    });
}

const externallyFundedTxs: string[] = [
    TransactionNames.PAYLOAD,
    TransactionNames.PROVER_STAKE,
    TransactionNames.CHALLENGE
];

// Currently only counting script sizes, not the actual transaction sizes.
// (Length input scripts + length of output scripts) / 8 bits per byte * fee per byte * fee factor percent / 100
// We add 1 satoshi to compensate for possible flooring by BigInt division.
function calculateTransactionFee(transaction: Transaction): bigint {
    const inputScriptsSize = transaction.inputs.reduce(
        (totalSize, input) => totalSize + (input.script?.length || 0), 0);
    const outputScriptsSize = transaction.outputs.reduce(
        (totalSize, output) => totalSize + output.spendingConditions.reduce(
            (totalSize, condition) => totalSize + (condition.script?.length || 0), 0), 0);
    const totalSize = Math.ceil((inputScriptsSize + outputScriptsSize) / 8);
    const requiredFee = BigInt(totalSize) * agentConf.feePerByte;
    const factoredFee = requiredFee * BigInt(agentConf.feeFactorPercent) / 100n;
    return factoredFee + 1n;
}

function addAmounts(setupId: string, transactions: Transaction[]) {

    function add(transaction: Transaction) {
            if (externallyFundedTxs.includes(transaction.transactionName)) return;
            const amountlessOutputs = transaction.outputs.filter(output => !output.amount);
            if (amountlessOutputs.length == 0) return;
            // If there are multiple undefined amounts, only the first carries the real value and the rest are symbolic.
            amountlessOutputs.slice(1).forEach(output => output.amount = agentConf.symbolicOutputAmount);

            const incomingAmount = transaction.inputs.reduce((totalValue, input) => {
                const output = findOutputByInput(transactions, input);
                if (!output.amount) add(getTransactionByName(transactions, input.transactionName));
                return totalValue + output.amount!;
            }, 0n);

            const existingOutputsAmount = transaction.outputs.reduce(
                (totalValue, output) => totalValue + (output.amount || 0n), 0n);

            amountlessOutputs[0].amount = incomingAmount - existingOutputsAmount - calculateTransactionFee(transaction);
            writeTransactionToFile(setupId, transaction);
    }

    transactions.forEach(add);
}

// This should probably be in a unit test.
function validateTransactionFees(transactions: Transaction[]) {
    const totals = transactions.reduce((totals, t) => {
        if (externallyFundedTxs.includes(t.transactionName)) return totals;

        const inputsValue = t.inputs.reduce(
            (totalValue, input) => totalValue + (findOutputByInput(transactions, input).amount || 0n), 0n);
        const outputsValue = t.outputs.reduce(
            (totalValue, output) => totalValue + (output.amount || 0n), 0n);
        const fee = inputsValue - outputsValue;
        const size = t.inputs.reduce(
            (totalSize, input) => totalSize + (input.script?.length || 0), 0
        ) + t.outputs.reduce(
            (totalSize, output) => totalSize + output.spendingConditions.reduce(
                (totalSize, condition) => totalSize + (condition.script?.length || 0), 0), 0);
        const requiredFee = calculateTransactionFee(t);

        if (inputsValue - outputsValue < 0) throw new Error(
            `Transaction ${t.transactionName} has negative value: ${inputsValue - outputsValue}`);
        if (inputsValue - outputsValue < requiredFee) throw new Error(
            `Transaction ${t.transactionName} has low fee: ${inputsValue - outputsValue - fee}`);
        return {
            size: totals.size + size,
            fee: totals.fee + fee
        };
    }, { size:0, fee: 0n });

    if(totals.fee / BigInt(Math.ceil(totals.size / 8 / 100 * agentConf.feeFactorPercent)) != agentConf.feePerByte) {
        throw new Error(
            `Fee per byte is not correct: ` +
            `${totals.fee / BigInt(Math.ceil(totals.size / 8 / 100 * agentConf.feeFactorPercent))} ` +
            `!= ${agentConf.feePerByte}`);
    }
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    const filenames = getTransactionFileNames('test_setup');
    const transactions = filenames.map(fn => loadTransactionFromFile('test_setup', fn));
    generateAllScripts('test_setup', transactions);
    addAmounts('test_setup', transactions);
    validateTransactionFees(transactions);
}
