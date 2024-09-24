import fs from 'fs';
import { AgentRoles } from './common';
import { getWinternitzPublicKeys, WotsType } from './winternitz';
import { agentConf, ONE_BITCOIN } from '../../agent.conf';

const twoDigits = (n: number) => n < 10 ? `0${n}` : `${n}`;

export const iterations = 19;

enum SignatureType {
    NONE = 'NONE',
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER',
    BOTH = 'BOTH'
}

interface FundingUtxo {
    transactionId: string;
    outputIndex: number;
    amount: bigint;
}

export interface SpendingCondition {
    timeoutBlocks?: number,
    signatureType: SignatureType;
    signaturesPublicKeys?: bigint[];
    wotsSpec?: WotsType[],
    wotsPublicKeys?: Buffer[][],
    script?: Buffer
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
}

export interface Transaction {
    role: AgentRoles;
    transactionName: string;
    transactionId?: string;
    inputs: Input[];
    outputs: Output[];
}

const protocolStart: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: 'payload',
        inputs: [],
        outputs: [{
            amount: 0n,
            spendingConditions: [{
                signatureType: SignatureType.BOTH
            }]
        }]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: 'prover_stake',
        inputs: [],
        outputs: [{
            amount: agentConf.proverStakeAmount,
            spendingConditions: [{
                signatureType: SignatureType.PROVER,
                wotsSpec: new Array(10).fill(WotsType._256)
            }]
        }]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: 'initial',
        inputs: [{
            transactionName: 'prover_stake',
            outputIndex: 0,
            spendingConditionIndex: 0
        }],
        outputs: [{
            amount: agentConf.proverStakeAmount - agentConf.symbolicOutputAmount - agentConf.initialTransactionFee,
            spendingConditions: [{
                timeoutBlocks: agentConf.smallTimeoutBlocks,
                signatureType: SignatureType.BOTH
            }, {
                signatureType: SignatureType.BOTH,
                wotsSpec: new Array(11).fill(WotsType._256)
            }, {
                timeoutBlocks: agentConf.largeTimeoutBlocks,
                signatureType: SignatureType.BOTH,
            }]
        }, ...new Array(5).fill({
            amount: agentConf.symbolicOutputAmount,
            spendingConditions: [{
                signatureType: SignatureType.BOTH,
                wotsSpec: new Array(11).fill(WotsType._256)
            }]
        }), {
            amount: agentConf.symbolicOutputAmount,
            spendingConditions: [{
                signatureType: SignatureType.BOTH
            }]
        }]
    }, {
        role: AgentRoles.VERIFIER,
        transactionName: 'challenge',
        inputs: [{
            transactionName: 'initial',
            outputIndex: 1,
            spendingConditionIndex: 0
        }],
        outputs: [{
            amount: agentConf.symbolicOutputAmount - agentConf.smallTransactionFee + agentConf.verifierStakeAmount,
            spendingConditions: [{
                signatureType: SignatureType.PROVER
            }]
        }]
    }, {
        role: AgentRoles.PROVER,
        transactionName: 'no_challenge',
        inputs: [{
            transactionName: 'payload',
            outputIndex: 0,
            spendingConditionIndex: 0
        },
        {
            transactionName: 'initial',
            outputIndex: 0,
            spendingConditionIndex: 0
        }, {
            transactionName: 'initial',
            outputIndex: 6,
            spendingConditionIndex: 0
        }],
        outputs: [{
            amount: agentConf.proverStakeAmount - agentConf.smallTransactionFee,
            spendingConditions: [{
                signatureType: SignatureType.PROVER
            }]
        }]
    }
];

const protocolEnd: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: 'semi_final',
        inputs: [
            {
                transactionName: `select_${twoDigits(iterations - 1)}`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }
        ],
        outputs: [
            {
                spendingConditions: [{
                    timeoutBlocks: agentConf.smallTimeoutBlocks,
                    signatureType: SignatureType.BOTH
                }, {
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [WotsType._256, WotsType._256, WotsType._256, WotsType._256]
                }]
            }
        ]
    }, {
        role: AgentRoles.VERIFIER,
        transactionName: 'final',
        inputs: [
            {
                transactionName: 'semi_final',
                outputIndex: 0,
                spendingConditionIndex: 1
            }
        ],
        outputs: [
            {
                spendingConditions: [{
                    signatureType: SignatureType.VERIFIER
                }]
            }
        ]
    }, {
        role: AgentRoles.PROVER,
        transactionName: 'prover_wins',
        inputs: [{
            transactionName: 'payload',
            outputIndex: 0,
            spendingConditionIndex: 0
        }, {
            transactionName: 'semi_final',
            outputIndex: 0,
            spendingConditionIndex: 0
        }],
        outputs: [{
            spendingConditions: [{ signatureType: SignatureType.PROVER }]
        }]
    }
];

function makeProtocolSteps(): Transaction[] {
    const result: Transaction[] = [];
    for (let i = 0; i < iterations; i++) {
        const state: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `state_${twoDigits(i)}`,
            inputs: [0, 1, 2, 3, 4, 5].map(j => ({
                transactionName: i == 0 ? 'initial' : `select_${twoDigits(i - 1)}`,
                outputIndex: j,
                spendingConditionIndex: i == 0 && j == 0 ? 1 : 0,
            })),
            outputs: [{
                spendingConditions: [{
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [WotsType._1]
                }]
            }]
        };
        const stateTimeout: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `state_timeout_${twoDigits(i)}`,
            inputs: [{
                transactionName: i == 0 ? 'initial' : `select_${twoDigits(i - 1)}`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }],
            outputs: [{
                spendingConditions: [{
                    signatureType: SignatureType.VERIFIER,
                    timeoutBlocks: agentConf.smallTimeoutBlocks
                }]
            }]
        };
        const select: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `select_${twoDigits(i)}`,
            inputs: [{
                transactionName: `state_${twoDigits(i)}`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }],
            outputs: i + 1 < iterations ? [0, 1, 2, 3, 4, 5].map(j => ({
                spendingConditions: [{
                    signatureType: SignatureType.BOTH,
                    wotsSpec: new Array(11).fill(WotsType._256)
                }]
            })) : [{
                spendingConditions: [{
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [
                        ...new Array(19).fill(WotsType._1),
                        ...[WotsType._256]
                    ]
                }]
            }]
        };
        const selectTimeout: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `select_timeout_${twoDigits(i)}`,
            inputs: [{
                transactionName: `payload`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }, {
                transactionName: `state_${twoDigits(i)}`,
                outputIndex: 0,
                spendingConditionIndex: 0
            }],
            outputs: [{
                spendingConditions: [{
                    signatureType: SignatureType.BOTH
                }]
            }]
        };
        result.push(state, stateTimeout, select, selectTimeout);
    }
    return result;
}

export function getTransactionByName(allTransactions: Transaction[], name: string): Transaction {
    const tx = allTransactions.find(t => t.transactionName == name);
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

const allTransactions = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];

assertOrder(allTransactions);

export function getTransactionNames(role?: AgentRoles): string[] {
    return allTransactions
        .filter(t => !role || t.role == role)
        .map(t => t.transactionName);
}

export function findOutputByInput(transactions: Transaction[], input: Input): Output {
    const tx = getTransactionByName(transactions, input.transactionName);
    const output = tx.outputs[input.outputIndex];
    if (!output) throw new Error('Output not found: ' + input.outputIndex);
    return output;
}

export function initializeTransactions(
    role: AgentRoles,
    setupId: string,
    proverPublicKey: bigint, verifierPublicKey: bigint,
    payloadUtxo: FundingUtxo, proverUtxo: FundingUtxo
): Transaction[] {

    fs.mkdirSync(`./generated/setups/${setupId}`, { recursive: true });

    const transactions: Transaction[] = allTransactions.map(t => fromJson(toJson(t)));

    const payload = getTransactionByName(transactions, 'payload');
    payload.transactionId = payloadUtxo.transactionId;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTransactionByName(transactions, 'prover_stake');
    proverStake.transactionId = proverUtxo.transactionId;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // generate wots keys

    transactions.forEach(t => {
        if (t.role == role) {
            t.inputs.forEach((input, inputIndex) => {
                const output = findOutputByInput(transactions, input);
                const spend = output.spendingConditions[input.spendingConditionIndex];
                if (!spend)
                    throw new Error('Invalid spending condition: ' + input.spendingConditionIndex);
                if (!spend.wotsSpec) return;
                spend.wotsPublicKeys = spend.wotsSpec
                    .map((wt, dataIndex) => getWinternitzPublicKeys(wt, [setupId, t.transactionName, inputIndex, dataIndex].toString()));
            });
        }
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


    transactions.forEach(t => writeTransactionToFile(setupId, t));
    return transactions;
}

function fromJson(json: string): Transaction {
    const obj = JSON.parse(json, (key, value) => {
        if (typeof value === 'string' && value.startsWith('0x') && value.endsWith('n'))
            return BigInt(value.replace('n', ''));
        if (typeof value === 'string' && value.startsWith('hex:'))
            return Buffer.from(value.replace('hex:', ''), 'hex');
        return value;
    });
    return obj;
}

function toJson(message: Transaction, spacer?: string): string {
    const json = JSON.stringify(message, (key, value) => {
        if (typeof value === "bigint") return `0x${value.toString(16)}n`;
        if (value.type == "Buffer" && value.data) {
            return 'hex:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    }, spacer);
    return json;
}

export function writeTransactionToFile(setupId: string, transaction: Transaction) {
    fs.writeFileSync(`./generated/setups/${setupId}/${transaction.transactionName}.json`,
        toJson(transaction, '\t')
    );
}

export function loadTransactionFromFile(setupId: string, transactionName: string): Transaction {
    return fromJson(fs.readFileSync(`./generated/setups/${setupId}/${transactionName}.json`).toString('ascii'));
}

export function loadAllTransactionsFromFiles(setupId: string): Transaction[] {
    const names = getTransactionNames();
    return names.map(name => loadTransactionFromFile(setupId, name));
}


const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initializeTransactions(AgentRoles.PROVER, 'test_setup', 1n, 2n, {
        transactionId: 'payload',
        outputIndex: 0,
        amount: ONE_BITCOIN
    }, {
        transactionId: 'prover_stake',
        outputIndex: 0,
        amount: ONE_BITCOIN
    });
}