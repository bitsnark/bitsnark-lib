import fs from 'fs';
import { TransactionNames, AgentRoles, FundingUtxo, iterations, twoDigits } from './common';
import { getWinternitzPublicKeys, WotsType } from './winternitz';
import { agentConf } from './agent.conf';
import { calculateStateSizes } from './regs-calc';
import { writeTransaction } from './db';

export const PROTOCOL_VERSION = 0.1;

enum SignatureType {
    NONE = 'NONE',
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER',
    BOTH = 'BOTH'
}

export interface SpendingCondition {
    timeoutBlocks?: number,
    signatureType: SignatureType;
    signaturesPublicKeys?: bigint[];
    nextRole: AgentRoles;
    wotsSpec?: WotsType[],
    wotsPublicKeys?: Buffer[][],
    script?: Buffer
    exampleWitness?: Buffer[][]
}

export interface Input {
    transactionId?: string;
    transactionName: string;
    outputIndex: number;
    spendingConditionIndex: number;
    data?: bigint[];
    script?: Buffer;
}

export interface Output {
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
}

const protocolStart: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.LOCKED_FUNDS,
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
        inputs: [],
        outputs: [{
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.BOTH,
                wotsSpec: new Array(10).fill(WotsType._256)
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
                wotsSpec: new Array(11).fill(WotsType._256)
            }, {
                // challenge but no state
                nextRole: AgentRoles.VERIFIER,
                timeoutBlocks: agentConf.largeTimeoutBlocks,
                signatureType: SignatureType.BOTH,
            }]
        }, ...new Array(5).fill({
            spendingConditions: [{
                nextRole: AgentRoles.PROVER,
                signatureType: SignatureType.BOTH,
                wotsSpec: new Array(11).fill(WotsType._256)
            }]
        }), {
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
            outputIndex: 6,
            spendingConditionIndex: 0
        }],
        outputs: [{
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
            outputIndex: 6,
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
        inputs: [
            {
                transactionName: `${TransactionNames.SELECT}_${twoDigits(iterations - 1)}`,
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

    const regCounts = calculateStateSizes();

    const result: Transaction[] = [];
    for (let i = 0; i < iterations; i++) {

        const state: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
            inputs: Array.from({length: Math.ceil(regCounts[i] / 10)}, (_, i) => i).map(j => ({
                transactionName: i == 0 ? TransactionNames.PROOF : `${TransactionNames.SELECT}_${twoDigits(i - 1)}`,
                outputIndex: j,
                spendingConditionIndex: i == 0 && j == 0 ? 1 : 0,
            })),
            outputs: [{
                spendingConditions: [{
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [WotsType._1]
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
            let regs = regCounts[i + 1];
            select.outputs = [];
            for (let j = 0; j < Math.ceil(regCounts[i + 1] / 10); j++) {
                select.outputs.push({
                    spendingConditions: [{
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: new Array(regs > 10 ? 10 : regs).fill(WotsType._256)
                    }]
                });
                regs -= 10;
            }
        } else {
            select.outputs = [{
                spendingConditions: [{
                    nextRole: AgentRoles.PROVER,
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [
                        WotsType._24,
                        ...new Array(iterations).fill(WotsType._1)
                    ]
                }]
            }];
        }
        select.outputs[0].spendingConditions.push({
            nextRole: AgentRoles.VERIFIER,
            timeoutBlocks: agentConf.smallTimeoutBlocks,
            signatureType: SignatureType.BOTH
        });

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

export function getTransactionByName(transactions: Transaction[], name: string): Transaction {
    const tx = transactions.find(t => t.transactionName == name);
    if (!tx) throw new Error('Transaction not found: ' + name);
    return tx;
}

function assertOrder(transactions: Transaction[]) {
    const map: any = {};
    transactions.forEach(t => {
        t.inputs.forEach(i => {
            if (!map[i.transactionName!]) throw new Error('Transaction not found: ' + i.transactionName);
            if (!map[i.transactionName!].outputs[i.outputIndex]) throw new Error(`Index not found: ${t.transactionName} ${i.outputIndex}`);
        });
        map[t.transactionName] = t;
    });
}

export function findOutputByInput(transactions: Transaction[], input: Input): Output {
    const tx = getTransactionByName(transactions, input.transactionName);
    const output = tx.outputs[input.outputIndex];
    if (!output) throw new Error('Output not found: ' + input.outputIndex);
    return output;
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
    
    const payload = getTransactionByName(transactions, TransactionNames.LOCKED_FUNDS);
    payload.txId = payloadUtxo.txId;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTransactionByName(transactions, TransactionNames.PROVER_STAKE);
    proverStake.txId = proverUtxo.txId;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // set ordinal
    transactions.forEach((t, i) => t.ordinal = i);

    // generate wots keys
    transactions.forEach(t => {
        t.protocolVersion = t.protocolVersion ?? PROTOCOL_VERSION;
        t.setupId = setupId;

        t.outputs.forEach((output, outputIndex) => {
            output.spendingConditions.forEach((sc, scIndex) => {

                if (sc.wotsSpec && sc.nextRole == role) {
                    sc.wotsPublicKeys = sc.wotsSpec!
                        .map((wt, dataIndex) => getWinternitzPublicKeys(
                            wt, 
                            [setupId, t.transactionName, outputIndex, scIndex, dataIndex].toString()));
                }
            });
        });
    });

    // copy timeouts from input to output for indexer
    transactions.forEach(t => {
        t.inputs.forEach((input, inputIndex) => {
            const output = findOutputByInput(transactions, input);
            const spend = output.spendingConditions[input.spendingConditionIndex];
            output.timeoutBlocks = spend.timeoutBlocks;
        });
    });

    // put schnorr keys where needed

    transactions.forEach(t => {
        t.inputs.forEach((input, inputIndex) => {
            const output = findOutputByInput(transactions, input);
            const spend = output.spendingConditions[input.spendingConditionIndex];
            if (!spend)
                throw new Error('Invalid spending condition: ' + input.spendingConditionIndex);
            spend.signaturesPublicKeys = [];
            if (spend.signatureType == SignatureType.PROVER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(proverPublicKey);
            }
            if (spend.signatureType == SignatureType.VERIFIER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(verifierPublicKey);
            }
        });
    });

    for (const t of transactions) {
        await writeTransaction(agentId, setupId, t);
    }

    return transactions;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    await initializeTransactions(agentId, AgentRoles.PROVER, 'test_setup', 1n, 2n, {
        txId: TransactionNames.LOCKED_FUNDS,
        outputIndex: 0,
        amount: agentConf.payloadAmount
    }, {
        txId: TransactionNames.PROVER_STAKE,
        outputIndex: 0,
        amount: agentConf.proverStakeAmount
    });
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
