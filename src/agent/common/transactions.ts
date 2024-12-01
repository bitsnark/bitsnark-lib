import { WotsType } from './winternitz';
import { agentConf } from '../agent.conf';
import { AgentRoles, iterations, TransactionNames } from './types';
import { array } from './array-utils';

export const twoDigits = (n: number) => (n < 10 ? `0${n}` : `${n}`);

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
    controlBlock?: Buffer;
}

export interface Input {
    index?: number;
    transactionId?: string;
    transactionName: string;
    outputIndex: number;
    spendingConditionIndex: number;
    nSequence?: number;
    data?: bigint[];
    script?: Buffer;
    controlBlock?: Buffer;
    proverSignature?: string;
    verifierSignature?: string;
    wotsPublicKeys?: Buffer[][];
}

export interface Output {
    index?: number;
    taprootKey?: Buffer;
    amount?: bigint;
    spendingConditions: SpendingCondition[];
}

export interface Transaction {
    templateId?: number;
    setupId?: string;
    protocolVersion?: string;
    role: AgentRoles;
    transactionName: string;
    ordinal?: number;
    txId?: string;
    inputs: Input[];
    outputs: Output[];
    external?: boolean;
    temporaryTxId?: boolean;
}

export const protocolStart: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.LOCKED_FUNDS,
        external: true,
        inputs: [],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROVER_STAKE,
        external: true,
        inputs: [],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH
                    },
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: array(8, WotsType._256_4)
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROOF,
        inputs: [
            {
                transactionName: TransactionNames.PROVER_STAKE,
                outputIndex: 0,
                spendingConditionIndex: 1
            }
        ],
        outputs: [
            {
                spendingConditions: [
                    {
                        // no challenge
                        nextRole: AgentRoles.PROVER,
                        timeoutBlocks: agentConf.smallTimeoutBlocks,
                        signatureType: SignatureType.BOTH
                    },
                    {
                        // state
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.BOTH,
                        wotsSpec: array(9, WotsType._256_4)
                    },
                    {
                        // challenge but no state
                        nextRole: AgentRoles.VERIFIER,
                        timeoutBlocks: agentConf.largeTimeoutBlocks,
                        signatureType: SignatureType.BOTH
                    }
                ]
            },
            {
                spendingConditions: [
                    {
                        // challenge
                        nextRole: AgentRoles.VERIFIER,
                        signatureType: SignatureType.BOTH
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.CHALLENGE,
        temporaryTxId: true,
        inputs: [
            {
                transactionName: TransactionNames.PROOF,
                outputIndex: 1,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                amount: agentConf.verifierPaymentAmount,
                spendingConditions: [
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.PROVER
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PROOF_UNCONTESTED,
        inputs: [
            {
                transactionName: TransactionNames.LOCKED_FUNDS,
                outputIndex: 0,
                spendingConditionIndex: 0
            },
            {
                transactionName: TransactionNames.PROOF,
                outputIndex: 0,
                spendingConditionIndex: 0
            },
            {
                transactionName: TransactionNames.PROOF,
                outputIndex: 1,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.PROVER
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.CHALLENGE_UNCONTESTED,
        inputs: [
            {
                transactionName: TransactionNames.PROOF,
                outputIndex: 0,
                spendingConditionIndex: 2
            }
        ],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.VERIFIER,
                        signatureType: SignatureType.VERIFIER
                    }
                ]
            }
        ]
    }
];

export const protocolEnd: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.ARGUMENT,
        inputs: array(5, (i) => ({
            transactionName: `${TransactionNames.SELECT}_${twoDigits(iterations - 1)}`,
            outputIndex: i,
            spendingConditionIndex: 0
        })),
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.VERIFIER,
                        signatureType: SignatureType.VERIFIER
                    },
                    {
                        nextRole: AgentRoles.PROVER,
                        timeoutBlocks: agentConf.smallTimeoutBlocks,
                        signatureType: SignatureType.BOTH
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.PROOF_REFUTED,
        temporaryTxId: true,
        inputs: [
            {
                transactionName: TransactionNames.ARGUMENT,
                outputIndex: 0,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.VERIFIER,
                        signatureType: SignatureType.VERIFIER
                    },
                    {
                        nextRole: AgentRoles.PROVER,
                        timeoutBlocks: agentConf.smallTimeoutBlocks,
                        signatureType: SignatureType.BOTH
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.ARGUMENT_UNCONTESTED,
        inputs: [
            {
                transactionName: TransactionNames.ARGUMENT,
                outputIndex: 0,
                spendingConditionIndex: 1
            },
            {
                transactionName: TransactionNames.LOCKED_FUNDS,
                outputIndex: 0,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                spendingConditions: [
                    {
                        nextRole: AgentRoles.PROVER,
                        signatureType: SignatureType.PROVER
                    }
                ]
            }
        ]
    }
];

export function makeProtocolSteps(): Transaction[] {
    const result: Transaction[] = [];
    for (let i = 0; i < iterations; i++) {
        const state: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
            inputs: [
                {
                    transactionName: i == 0 ? TransactionNames.PROOF : `${TransactionNames.SELECT}_${twoDigits(i - 1)}`,
                    outputIndex: 0,
                    spendingConditionIndex: i == 0 ? 1 : 0
                }
            ],
            outputs: [
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.VERIFIER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: [WotsType._24]
                        },
                        {
                            nextRole: AgentRoles.PROVER,
                            timeoutBlocks: agentConf.smallTimeoutBlocks,
                            signatureType: SignatureType.BOTH
                        }
                    ]
                }
            ]
        };

        const stateTimeout: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.STATE_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [
                {
                    transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
                    outputIndex: 0,
                    spendingConditionIndex: 1
                },
                {
                    transactionName: TransactionNames.LOCKED_FUNDS,
                    outputIndex: 0,
                    spendingConditionIndex: 0
                }
            ],
            outputs: [
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.PROVER
                        }
                    ]
                }
            ]
        };

        const select: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `${TransactionNames.SELECT}_${twoDigits(i)}`,
            inputs: [
                {
                    transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
                    outputIndex: 0,
                    spendingConditionIndex: 0
                }
            ],
            outputs: []
        };

        if (i + 1 < iterations) {
            // every state should have 9 merkle roots

            select.outputs = [
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: array(9, WotsType._256_4)
                        },
                        // timeout
                        {
                            nextRole: AgentRoles.VERIFIER,
                            timeoutBlocks: agentConf.smallTimeoutBlocks,
                            signatureType: SignatureType.BOTH
                        }
                    ]
                }
            ];
        } else {
            // the last one is leading up to the argument

            select.outputs = [
                {
                    // this is the full selection path
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: array(7, WotsType._24)
                        },
                        // timeout
                        {
                            nextRole: AgentRoles.VERIFIER,
                            timeoutBlocks: agentConf.smallTimeoutBlocks,
                            signatureType: SignatureType.BOTH
                        }
                    ]
                },
                // the a, b, c, and d
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: [WotsType._256_4, WotsType._256_4, WotsType._256_4, WotsType._256_4]
                        }
                    ]
                },
                ...array<Output>(3, (_) => ({
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: array<WotsType>(11, WotsType._256_4)
                        }
                    ]
                }))
            ];
        }

        const selectTimeout: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `${TransactionNames.SELECT_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [
                {
                    transactionName: `${TransactionNames.SELECT}_${twoDigits(i)}`,
                    outputIndex: 0,
                    spendingConditionIndex: 1
                }
            ],
            outputs: [
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.VERIFIER,
                            signatureType: SignatureType.VERIFIER
                        }
                    ]
                }
            ]
        };
        result.push(state, stateTimeout, select, selectTimeout);
    }
    return result;
}

export function getTransactionByName(transactions: Transaction[], name: string): Transaction {
    const tx = transactions.find((t) => t.transactionName == name);
    if (!tx) throw new Error('Transaction not found: ' + name);
    return tx;
}

export function getTransactionByTemplateId(transactions: Transaction[], templateId: number): Transaction {
    const tx = transactions.find((t) => t.templateId == templateId);
    if (!tx) throw new Error('Transaction not found: ' + templateId);
    return tx;
}

export function getTransactionByInput(transactions: Transaction[], input: Input): Transaction {
    const tx = transactions.find((t) => t.transactionName == input.transactionName);
    if (!tx) {
        console.error('Transaction not found: ', input);
        throw new Error('Transaction not found');
    }
    return tx;
}

export function findOutputByInput(transactions: Transaction[], input: Input): Output {
    const tx = getTransactionByName(transactions, input.transactionName);
    const output = tx.outputs[input.outputIndex];
    if (!output) throw new Error('Output not found: ' + input.outputIndex);
    return output;
}

export function getSpendingConditionByInput(transactions: Transaction[], input: Input): SpendingCondition {
    const tx = transactions.find((t) => t.transactionName == input.transactionName);
    if (!tx) {
        console.error('Transaction not found: ', input);
        throw new Error('Transaction not found');
    }
    if (!tx.outputs[input.outputIndex]) throw new Error('Output not found');
    if (!tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex])
        throw new Error('Spending condition not found');
    return tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
}

export function assertOrder(transactions: Transaction[]) {
    const map: { [key: string]: Transaction } = {};

    for (const t of transactions) {
        for (const i of t.inputs) {
            if (!map[i.transactionName!]) throw new Error('Transaction not found: ' + i.transactionName);
            if (!map[i.transactionName!].outputs[i.outputIndex])
                throw new Error(`Index not found: ${t.transactionName} ${i.outputIndex}`);
        }
        map[t.transactionName] = t;
    }
}

export function createUniqueDataId(
    setupId: string,
    transactionName: string,
    outputIndex: number,
    scIndex: number,
    dataIndex: number
) {
    return `${setupId}/${transactionName}/${outputIndex}/${scIndex}/${dataIndex}`;
}
