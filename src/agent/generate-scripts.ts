import { Bitcoin } from '../generator/step3/bitcoin';
import { bufferToBigintBE, WOTS_NIBBLES, WotsType } from './winternitz';
import { AgentRoles, iterations, TransactionNames } from './common';
import { StackItem } from '../generator/step3/stack';
import { SimpleTapTree } from './simple-taptree';
import { agentConf } from './agent.conf';
import { Buffer } from 'node:buffer';
import { findOutputByInput, getTransactionByName, Input, SpendingCondition, Transaction } from './transactions-new';
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

function generateBoilerplate(setupId: string, myRole: AgentRoles, prevTransaction: Transaction, input: Input): Buffer {

    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = false;

    const output = prevTransaction.outputs[input.outputIndex];
    const spendingCondition = output.spendingConditions[input.spendingConditionIndex];

    if (spendingCondition.signaturesPublicKeys) {
        for (const key of spendingCondition.signaturesPublicKeys) {
            bitcoin.verifySignature(key);
        }
    }

    if (spendingCondition.timeoutBlocks) {
        bitcoin.checkTimeout(spendingCondition.timeoutBlocks);
    }

    if (spendingCondition.wotsSpec) {

        const keys = spendingCondition.wotsPublicKeys!
            .map(keys => keys.map(b => bufferToBigintBE(b)));

        const witnessSIs = spendingCondition.exampleWitness ? spendingCondition.exampleWitness!
            .map(values => values.map(v => bitcoin.addWitness(bufferToBigintBE(v)))) :
            spendingCondition.wotsSpec!
                .map(spec => new Array(WOTS_NIBBLES[spec]).fill(0).map(_ => bitcoin.addWitness(0n)));

        const decoders = {
            [WotsType._256]: (dataIndex: number) =>
                bitcoin.winternitzCheck256(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._24]: (dataIndex: number) =>
                bitcoin.winternitzCheck24(witnessSIs[dataIndex], keys[dataIndex]),
            [WotsType._1]: (dataIndex: number) =>
                bitcoin.winternitzCheck1(witnessSIs[dataIndex], keys[dataIndex]),
        };
        for (const [dataIndex, spec] of spendingCondition.wotsSpec.entries()) decoders[spec](dataIndex);
    }

    return bitcoin.programToBinary();
}

function generateProcessSelectionPath(sc: SpendingCondition): Buffer {
    
    const bitcoin = new Bitcoin();
    bitcoin.throwOnFail = false;

    const pubKeys = sc.wotsPublicKeys!;

    const pathWitness: StackItem[][] = [];
    for (let i = 0; i < iterations; i++) {
        pathWitness[i] = pubKeys[i].map(_ => bitcoin.addWitness(0n));
    }

    const indexNibbles: StackItem[] = pubKeys[0].map(_ => bitcoin.addWitness(0n));

    const pathNibbles: StackItem[][] = [];
    for (let i = 0; i < iterations; i++) {
        const result = indexNibbles.map(_ => bitcoin.newStackItem(0n));
        pathNibbles.push(result);
        bitcoin.winternitzDecode24(
            result,
            pathWitness[i],
            pubKeys[i].map(b => bufferToBigintBE(b))
        );
    }

    bitcoin.checkSemiFinal(pathNibbles, indexNibbles);

    return bitcoin.programToBinary();
}

export async function generateAllScripts(
    agentId: string, setupId: string, myRole: AgentRoles, transactions: Transaction[]
): Promise<Transaction[]> {

    for (const t of transactions.filter(t => !t.external)) {
        console.log('transaction name: ', t.transactionName);

        // check that all sc have wots public keys if they need them
        for (const output of t.outputs) {
            for (const sc of output.spendingConditions) {
                if (!sc.wotsSpec) break;
                if (!sc.wotsPublicKeys)
                    throw new Error('Missing keys');
                if (sc.wotsSpec.length != sc.wotsPublicKeys.length)
                    throw new Error('Invalid keys length 1');
                sc.wotsSpec.forEach((spec, dataIndex) => {
                    if (sc.wotsPublicKeys![dataIndex].length != WOTS_NIBBLES[spec])
                        throw new Error('Invaid keys length 2');
                });
            }
        }

        if (t.transactionName == TransactionNames.PROOF_REFUTED) {
            const taproot = generateFinalStepTaproot(transactions);
            const argument = getTransactionByName(transactions, TransactionNames.ARGUMENT);
            if (argument.outputs.length != 1)
                throw new Error('Wrong number of outputs');
            argument.outputs[0].taprootKey = taproot;
        } else {
            for (const input of t.inputs) {

                const prevT = getTransactionByName(transactions, input.transactionName);
                const prevOutput = prevT.outputs[input.outputIndex];
                const sc = prevOutput.spendingConditions[input.spendingConditionIndex];

                let script;

                // the first input of the argument is different
                if (t.transactionName == TransactionNames.ARGUMENT && input.index == 0) {
                    script = generateProcessSelectionPath(sc);
                } else {
                    script = generateBoilerplate(setupId, myRole, prevT, input);
                }

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

    // generate the taproot key for all outputs except in the argument tx
    setTaprootKey(transactions);

    await writeTransactions(agentId, setupId, transactions);

    return transactions;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const transactions = await readTransactions(agentId, setupId);
    await generateAllScripts(agentId, 'test_setup', AgentRoles.PROVER, transactions);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
