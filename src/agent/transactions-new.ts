import { TransactionNames, AgentRoles, FundingUtxo, iterations, twoDigits, random, array } from './common';
import { bigintToBufferBE, encodeWinternitz, getWinternitzPublicKeys, WOTS_NIBBLES, WotsType } from './winternitz';
import { agentConf } from './agent.conf';
import { dev_ClearTemplates, SetupStatus, writeSetupStatus, writeTemplates } from './db';

export const PROTOCOL_VERSION = 0.2;

export enum SignatureType {
    NONE = 'NONE',
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER',
    BOTH = 'BOTH'
}

export interface SpendingCondition {
    index?: number;
    timeoutBlocks?: number;
    signatureType: SignatureType;
    signaturesPublicKeys?: Buffer[];
    nextRole: AgentRoles;
    wotsSpec?: WotsType[];
    wotsPublicKeys?: Buffer[][];
    script?: Buffer;
    exampleWitness?: Buffer[][];
    wotsPublicKeysDebug?: string[][];
    exampleWitnessDebug?: string[][];
    controlBlock?: Buffer;
}

export interface Input {
    index?: number;
    transactionId?: string;
    transactionName: string;
    outputIndex: number;
    spendingConditionIndex: number;
    data?: bigint[];
    script?: Buffer;
    proverSignature?: string;
    verifierSignature?: string;
}

export interface Output {
    index?: number;
    taprootKey?: Buffer;
    amount?: bigint;
    spendingConditions: SpendingCondition[];
    timeoutBlocks?: number;
}

export interface Transaction {
    setupId?: string,
    protocolVersion?: number,
    role: AgentRoles;
    transactionName: string;
    ordinal?: number;
    txId?: string;
    inputs: Input[];
    outputs: Output[];
    external?: boolean;
}

const protocolStart: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.LOCKED_FUNDS,
        external: true,
        inputs: [],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.BOTH
            }]
        }]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROVER_STAKE,
        external: true,
        inputs: [],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.BOTH,
                wotsSpec: array(8, WotsType._256)
            }]
        }]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROOF,
        inputs: [{
            transactionName: TransactionNames.PROVER_STAKE,
            outputIndex: 0,
            spendingConditionIndex: 0
        }],
        outputs: [{
            spendingConditions: [{
                // no challenge
                nextRole: AgentRoles.PROVER,
                timeoutBlocks: agentConf.smallTimeoutBlocks,
                signatureType: SignatureType.BOTH
            }, {
                // state
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.BOTH,
                wotsSpec: array(9, WotsType._256)
            }, {
                // challenge but no state
                nextRole: AgentRoles.VERIFIER,
                timeoutBlocks: agentConf.largeTimeoutBlocks,
                signatureType: SignatureType.BOTH,
            }]
        }, {
            spendingConditions: [{
                // challenge
                nextRole: AgentRoles.VERIFIER,
                signatureType: SignatureType.BOTH
            }]
        }]
    }, {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.CHALLENGE,
        inputs: [{
            transactionName: TransactionNames.PROOF,
            outputIndex: 1,
            spendingConditionIndex: 0
        }],
        outputs: [{
            amount: agentConf.verifierPaymentAmount,
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.PROVER
            }]
        }]
    }, {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROOF_UNCONTESTED,
        inputs: [{
            transactionName: TransactionNames.LOCKED_FUNDS,
            outputIndex: 0,
            spendingConditionIndex: 0
        },
        {
            transactionName: TransactionNames.PROOF,
            outputIndex: 0,
            spendingConditionIndex: 0
        }, {
            transactionName: TransactionNames.PROOF,
            outputIndex: 1,
            spendingConditionIndex: 0
        }],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.PROVER
            }]
        }]
    }, {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.CHALLENGE_UNCONTESTED,
        inputs: [{
            transactionName: TransactionNames.PROOF,
            outputIndex: 0,
            spendingConditionIndex: 2
        }],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.VERIFIER,
                signatureType: SignatureType.VERIFIER
            }]
        }]
    }
];

const protocolEnd: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.ARGUMENT,
        inputs: array(6, (i: number) => ({
            transactionName: `${TransactionNames.SELECT}_${twoDigits(iterations - 1)}`,
            outputIndex: i,
            spendingConditionIndex: 0
        })),
        outputs: [
            {
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.VERIFIER
                }, {
                    nextRole: AgentRoles.PROVER,
                    timeoutBlocks: agentConf.smallTimeoutBlocks,
                    signatureType: SignatureType.BOTH
                }]
            }
        ]
    },
    {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.PROOF_REFUTED,
        inputs: [
            {
                transactionName: TransactionNames.ARGUMENT,
                outputIndex: 0,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.VERIFIER
                }, {
                    nextRole: AgentRoles.PROVER,
                    timeoutBlocks: agentConf.smallTimeoutBlocks,
                    signatureType: SignatureType.BOTH
                }]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.ARGUMENT_UNCONTESTED,
        inputs: [{
            transactionName: TransactionNames.ARGUMENT,
            outputIndex: 0,
            spendingConditionIndex: 1
        }, {
            transactionName: TransactionNames.LOCKED_FUNDS,
            outputIndex: 0,
            spendingConditionIndex: 0
        }],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.PROVER
            }]
        }]
    }
];

function makeProtocolSteps(): Transaction[] {

    const result: Transaction[] = [];
    for (let i = 0; i < iterations; i++) {

        const state: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
            inputs: [{
                transactionName: i == 0 ? TransactionNames.PROOF : `${TransactionNames.SELECT}_${twoDigits(i - 1)}`,
                outputIndex: 0,
                spendingConditionIndex: i == 0 ? 1 : 0,
            }],
            outputs: [{
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [WotsType._24]
                }, {
                    nextRole: AgentRoles.PROVER,
                    timeoutBlocks: agentConf.smallTimeoutBlocks,
                    signatureType: SignatureType.BOTH,
                }]
            }]
        };

        const stateTimeout: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.STATE_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [{
                transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
                outputIndex: 0,
                spendingConditionIndex: 1
            }, {
                transactionName: TransactionNames.LOCKED_FUNDS,
                outputIndex: 0,
                spendingConditionIndex: 0
            }],
            outputs: [{
                spendingConditions: [{
                    nextRole: AgentRoles.PROVER,
                    signatureType: SignatureType.PROVER
                }]
            }]
        };

        const select: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `${TransactionNames.SELECT}_${twoDigits(i)}`,
            inputs: [{
                transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }],
            outputs: []
        };

        if (i + 1 < iterations) {

            // every state should have 9 merkle roots

            select.outputs = [{
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.BOTH,
                    wotsSpec: array(9, WotsType._256)
                },
                // timeout
                {
                    nextRole: AgentRoles.VERIFIER,
                    timeoutBlocks: agentConf.smallTimeoutBlocks,
                    signatureType: SignatureType.BOTH
                }]
            }];
        } else {

            // the last one is leading up to the argument

            select.outputs = [
                {
                    // this is the full selection path
                    spendingConditions: [{
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: array(7, WotsType._24)
                    },
                    // timeout
                    {
                        nextRole: AgentRoles.VERIFIER,
                        timeoutBlocks: agentConf.smallTimeoutBlocks,
                        signatureType: SignatureType.BOTH
                    }]
                },
                // the a, b, c, and d
                {
                    spendingConditions: [{

                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: [WotsType._256, WotsType._256, WotsType._256, WotsType._256]
                    }]
                },
                // 3 merkle proofs of 12 hashes each, that's 4 outputs with 10, 10, 10, and 6 values

                ...[10, 10, 10, 6].map(n => ({
                    spendingConditions: [{
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: array<WotsType>(n, WotsType._256)
                    }]
                }))];
        }

        const selectTimeout: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `${TransactionNames.SELECT_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [{
                transactionName: `${TransactionNames.SELECT}_${twoDigits(i)}`,
                outputIndex: 0,
                spendingConditionIndex: 1
            }],
            outputs: [{
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.VERIFIER
                }]
            }]
        };
        result.push(state, stateTimeout, select, selectTimeout);
    }
    return result;
}

export function mergeWots(role: AgentRoles, mine: Transaction[], theirs: Transaction[]): Transaction[] {

    const notNull = (t: any) => {
        if (!t) throw new Error('Null error');
        return t;
    }

    return mine.map((transaction, transactionIndex) => ({
        ...transaction,
        outputs: transaction.outputs.map((output, outputIndex) => ({
            ...output,
            spendingConditions: output.spendingConditions.map((sc, scIndex) => ({
                ...sc,
                wotsPublicKeys: !sc.wotsSpec ? undefined : (sc.nextRole == role ?
                    notNull(sc.wotsPublicKeys) :
                    notNull(theirs[transactionIndex].outputs[outputIndex].spendingConditions[scIndex].wotsPublicKeys))
            }))
        }))
    }));
}

export function getTransactionByName(transactions: Transaction[], name: string): Transaction {
    const tx = transactions.find(t => t.transactionName == name);
    if (!tx)
        throw new Error('Transaction not found: ' + name);
    return tx;
}

export function getTransactionByInput(transactions: Transaction[], input: Input): Transaction {
    const tx = transactions.find(t => t.transactionName == input.transactionName);
    if (!tx) {
        console.error('Transaction not found: ', input);
        throw new Error('Transaction not found');
    }
    return tx;
}

export function getOutputByInput(transactions: Transaction[], input: Input): Output {
    const tx = transactions.find(t => t.transactionName == input.transactionName);
    if (!tx) {
        console.error('Transaction not found: ', input);
        throw new Error('Transaction not found');
    }
    if (!tx.outputs[input.outputIndex]) throw new Error('Output not found');
    return tx.outputs[input.outputIndex];
}

export function getSpendingConditionByInput(transactions: Transaction[], input: Input): SpendingCondition {
    const tx = transactions.find(t => t.transactionName == input.transactionName);
    if (!tx) {
        console.error('Transaction not found: ', input);
        throw new Error('Transaction not found');
    }
    if (!tx.outputs[input.outputIndex]) throw new Error('Output not found');
    if (!tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex]) throw new Error('Spending condition not found');
    return tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
}

function assertOrder(transactions: Transaction[]) {
    const map: any = {};
    for (const t of transactions) {
        for (const i of t.inputs) {
            if (!map[i.transactionName!]) throw new Error('Transaction not found: ' + i.transactionName);
            if (!map[i.transactionName!].outputs[i.outputIndex]) throw new Error(`Index not found: ${t.transactionName} ${i.outputIndex}`);
        }
        map[t.transactionName] = t;
    }
}

export function findOutputByInput(transactions: Transaction[], input: Input): Output {
    const tx = getTransactionByName(transactions, input.transactionName);
    const output = tx.outputs[input.outputIndex];
    if (!output) throw new Error('Output not found: ' + input.outputIndex);
    return output;
}

export function createUniqueDataId(setupId: string, transactionName: string, outputIndex: number, scIndex: number, dataIndex: number) {
    return `${setupId}/${transactionName}/${outputIndex}/${scIndex}/${dataIndex}`;
}

export async function initializeTransactions(
    agentId: string,
    role: AgentRoles,
    setupId: string,
    proverPublicKey: bigint, verifierPublicKey: bigint,
    payloadUtxo: FundingUtxo, proverUtxo: FundingUtxo
): Promise<Transaction[]> {

    const transactions = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];
    assertOrder(transactions);

    for (const t of transactions) {
        t.inputs.forEach((input, i) => input.index = i);
        t.outputs.forEach((output, i) => {
            output.index = i;
            output.spendingConditions.forEach((sc, i) => sc.index = i);
        });
    }

    const payload = getTransactionByName(transactions, TransactionNames.LOCKED_FUNDS);
    payload.txId = payloadUtxo.txId;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTransactionByName(transactions, TransactionNames.PROVER_STAKE);
    proverStake.txId = proverUtxo.txId;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // set ordinal, setup id and protocol version
    for (const [i, t] of transactions.entries()) {
        t.protocolVersion = t.protocolVersion ?? PROTOCOL_VERSION;
        t.setupId = setupId;
        t.ordinal = i;
    }

    // generate wots keys
    for (const transaction of transactions) {
        for (let input of transaction.inputs) {
            const output = getOutputByInput(transactions, input);
            const sc = getSpendingConditionByInput(transactions, input);
            const prevTx = getTransactionByInput(transactions, input);

            if (sc.wotsSpec && sc.nextRole == role) {
                sc.wotsPublicKeys = sc.wotsSpec!
                    .map((wt, dataIndex) => getWinternitzPublicKeys(
                        wt, createUniqueDataId(setupId, prevTx.transactionName, input.outputIndex,
                            input.spendingConditionIndex, dataIndex)));

                let values: bigint[];
                if (transaction.transactionName == TransactionNames.ARGUMENT && input.index == 0) {
                    values = [1n, 2n, 3n, 4n, 5n, 6n];
                    values.push(values.reduce((p, c) => p * 10n + c, 0n));
                } else {
                    values = sc.wotsSpec.map(spec => random(32) % (2n ** BigInt(3 * WOTS_NIBBLES[spec])));
                }

                sc.exampleWitness = sc.wotsSpec
                    .map((spec, dataIndex) => {
                        return encodeWinternitz(spec, values[dataIndex], createUniqueDataId(setupId,
                            prevTx.transactionName, input.outputIndex, input.spendingConditionIndex, dataIndex));
                    });

                sc.exampleWitnessDebug = sc.wotsSpec
                    .map((spec, dataIndex) => new Array(WOTS_NIBBLES[spec]).fill(0).map((_, i) =>
                        createUniqueDataId(setupId, prevTx.transactionName, input.outputIndex,
                            input.spendingConditionIndex, dataIndex) + '/' + i));
            }
        }
    }

    for (const transaction of transactions) {
        for (const [outputIndex, output] of transaction.outputs.entries()) {
            for (const [scIndex, sc] of output.spendingConditions.entries()) {
                if (sc.wotsSpec && sc.nextRole == role) {
                    sc.wotsPublicKeysDebug = sc.wotsSpec!
                        .map((spec, dataIndex) =>
                            new Array(WOTS_NIBBLES[spec]).fill(0).map((_, i) => createUniqueDataId(setupId, transaction.transactionName, outputIndex, scIndex, dataIndex) + '/' + i));
                }
            }
        }
    }

    // copy timeouts from input to output for indexer
    for (const t of transactions) {
        for (const input of t.inputs) {
            const output = findOutputByInput(transactions, input);
            const spend = output.spendingConditions[input.spendingConditionIndex];
            output.timeoutBlocks = spend.timeoutBlocks;
        }
    }

    // put schnorr keys where needed

    for (const t of transactions) {
        for (const [inputIndex, input] of t.inputs.entries()) {
            const output = findOutputByInput(transactions, input);
            const spend = output.spendingConditions[input.spendingConditionIndex];
            if (!spend)
                throw new Error('Invalid spending condition: ' + input.spendingConditionIndex);
            spend.signaturesPublicKeys = [];
            if (spend.signatureType == SignatureType.PROVER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(bigintToBufferBE(proverPublicKey, 32));
            }
            if (spend.signatureType == SignatureType.VERIFIER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(bigintToBufferBE(verifierPublicKey, 32));
            }
        }
    }

    // put index in each object to make it easier later!
    transactions.forEach(t => t.inputs.forEach((i, index) => i.index = index));
    transactions.forEach(t => t.outputs.forEach((o, index) => {
        o.index = index;
        o.spendingConditions.forEach((sc, index) => sc.index = index);
    }));

    await writeTemplates(agentId, setupId, transactions);

    return transactions;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';

    if (process.argv.some(s => s == '--clear')) {
        console.log('Deleting transactions...');
        dev_ClearTemplates(setupId, agentId);
    }

    console.log('Create / Update setup...');
    await writeSetupStatus(setupId, SetupStatus.PENDING);

    console.log('Initializing transactions...');
    await initializeTransactions(agentId, AgentRoles.PROVER, setupId, 1n, 2n, {
        txId: '0000000000000000000000000000000000000000000000000000000000000000',
        outputIndex: 0,
        amount: agentConf.payloadAmount,
        external: true
    }, {
        txId: '1111111111111111111111111111111111111111111111111111111111111111',
        outputIndex: 0,
        amount: agentConf.proverStakeAmount,
        external: true
    });
    console.log('Done.');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
