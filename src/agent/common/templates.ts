import { WotsType } from './winternitz';
import { agentConf } from '../agent.conf';
import {
    AgentRoles,
    Input,
    iterations,
    Output,
    SignatureType,
    SpendingCondition,
    Template,
    TemplateNames
} from './types';
import { array } from './array-utils';

export const twoDigits = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const protocolStart: Template[] = [
    {
        role: AgentRoles.PROVER,
        name: TemplateNames.LOCKED_FUNDS,
        isExternal: true,
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
        name: TemplateNames.PROVER_STAKE,
        isExternal: true,
        inputs: [],
        outputs: [
            {
                spendingConditions: [
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
        name: TemplateNames.PROOF,
        inputs: [
            {
                templateName: TemplateNames.PROVER_STAKE,
                outputIndex: 0,
                spendingConditionIndex: 0
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
                // Do NOT add any extra value to make CHALLENGE output high enough to pass dust limit.
                amount: agentConf.symbolicOutputAmount,
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
        name: TemplateNames.CHALLENGE,
        unknownTxid: true,
        fundable: true,
        inputs: [
            {
                templateName: TemplateNames.PROOF,
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
        name: TemplateNames.PROOF_UNCONTESTED,
        inputs: [
            {
                templateName: TemplateNames.LOCKED_FUNDS,
                outputIndex: 0,
                spendingConditionIndex: 0
            },
            {
                templateName: TemplateNames.PROOF,
                outputIndex: 0,
                spendingConditionIndex: 0
            },
            {
                templateName: TemplateNames.PROOF,
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
        name: TemplateNames.CHALLENGE_UNCONTESTED,
        inputs: [
            {
                templateName: TemplateNames.PROOF,
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

export const protocolEnd: Template[] = [
    {
        role: AgentRoles.PROVER,
        name: TemplateNames.ARGUMENT,
        inputs: array(6, (i) => ({
            templateName: `${TemplateNames.SELECT}_${twoDigits(iterations - 1)}`,
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
        name: TemplateNames.PROOF_REFUTED,
        unknownTxid: true,
        inputs: [
            {
                templateName: TemplateNames.ARGUMENT,
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
                    }
                ]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        name: TemplateNames.ARGUMENT_UNCONTESTED,
        inputs: [
            {
                templateName: TemplateNames.ARGUMENT,
                outputIndex: 0,
                spendingConditionIndex: 1
            },
            {
                templateName: TemplateNames.LOCKED_FUNDS,
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

export function makeProtocolSteps(): Template[] {
    const result: Template[] = [];
    for (let i = 0; i < iterations; i++) {
        const state: Template = {
            role: AgentRoles.PROVER,
            name: `${TemplateNames.STATE}_${twoDigits(i)}`,
            inputs: [
                {
                    templateName: i == 0 ? TemplateNames.PROOF : `${TemplateNames.SELECT}_${twoDigits(i - 1)}`,
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

        const stateTimeout: Template = {
            role: AgentRoles.PROVER,
            name: `${TemplateNames.STATE_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [
                {
                    templateName: `${TemplateNames.STATE}_${twoDigits(i)}`,
                    outputIndex: 0,
                    spendingConditionIndex: 1
                },
                {
                    templateName: TemplateNames.LOCKED_FUNDS,
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

        const select: Template = {
            role: AgentRoles.VERIFIER,
            name: `${TemplateNames.SELECT}_${twoDigits(i)}`,
            inputs: [
                {
                    templateName: `${TemplateNames.STATE}_${twoDigits(i)}`,
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
                            wotsSpec: array<WotsType>(12, WotsType._256_4)
                        }
                    ]
                })),
                {
                    spendingConditions: [
                        {
                            nextRole: AgentRoles.PROVER,
                            signatureType: SignatureType.BOTH,
                            wotsSpec: array<WotsType>(3, WotsType._256_4)
                        }
                    ]
                }
            ];
        }

        const selectTimeout: Template = {
            role: AgentRoles.VERIFIER,
            name: `${TemplateNames.SELECT_UNCONTESTED}_${twoDigits(i)}`,
            inputs: [
                {
                    templateName: `${TemplateNames.SELECT}_${twoDigits(i)}`,
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

export function getTemplateByName(templates: Template[], name: string): Template {
    const tx = templates.find((t) => t.name == name);
    if (!tx) throw new Error('Template not found: ' + name);
    return tx;
}

export function getTemplateByTemplateId(templates: Template[], templateId: number): Template {
    const tx = templates.find((t) => t.id == templateId);
    if (!tx) throw new Error('Template not found: ' + templateId);
    return tx;
}

export function getTemplateByInput(templates: Template[], input: Input): Template {
    const tx = templates.find((t) => t.name == input.templateName);
    if (!tx) {
        console.error('Template not found: ', input);
        throw new Error('Template not found');
    }
    return tx;
}

export function findOutputByInput(templates: Template[], input: Input): Output {
    const tx = getTemplateByName(templates, input.templateName);
    const output = tx.outputs[input.outputIndex];
    if (!output) throw new Error('Output not found: ' + input.outputIndex);
    return output;
}

export function getSpendingConditionByInput(templates: Template[], input: Input): SpendingCondition {
    const tx = templates.find((t) => t.name == input.templateName);
    if (!tx) {
        console.error('Template not found: ', input);
        throw new Error('Template not found');
    }
    if (!tx.outputs[input.outputIndex]) throw new Error('Output not found');
    if (!tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex])
        throw new Error('Spending condition not found');
    return tx.outputs[input.outputIndex].spendingConditions[input.spendingConditionIndex];
}

export function assertOrder(templates: Template[]) {
    const map: { [key: string]: Template } = {};

    for (const t of templates) {
        for (const i of t.inputs) {
            if (!map[i.templateName!]) throw new Error('Template not found: ' + i.templateName);
            if (!map[i.templateName!].outputs[i.outputIndex])
                throw new Error(`Index not found: ${t.name} ${i.outputIndex}`);
        }
        map[t.name] = t;
    }
}
