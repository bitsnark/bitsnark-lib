import fs from 'fs';
import { AgentRoles, FundingUtxo, iterations, twoDigits } from './common';
import { getWinternitzPublicKeys, WotsType } from './winternitz';
import { agentConf, ONE_BITCOIN } from '../../agent.conf';
import { calculateStateSizes } from './regs-calc';

export const PROTOCOL_VERSION = 0.1;

export const enum TransactionNames {
    PAYLOAD = 'payload',
    PROVER_STAKE = 'prover_stake',
    INITIAL = 'initial',
    NO_CHALLENGE = 'no_challenge',
    VERIFIER_PAYMENT = 'verifier_payment',
    CHALLENGE = 'challenge',
    VERIFIER_WINS = 'verifier_wins',
    STATE = 'state',
    STATE_TIMEOUT = 'state_timeout',
    SELECT = 'select',
    SELECT_TIMEOUT = 'select_timeout',
    SEMI_FINAL = 'semi_final',
    FINAL = 'final',
    PROVER_WINS = 'prover_wins'
}

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
}

export interface Transaction {
    setupId?: string,
    protocolVersion?: number,
    role: AgentRoles;
    transactionName: string;
    txId?: string;
    inputs: Input[];
    outputs: Output[];
}

const protocolStart: Transaction[] = [
    {
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.PAYLOAD,
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
        transactionName: TransactionNames.INITIAL,
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
            transactionName: TransactionNames.INITIAL,
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
        role: AgentRoles.PROVER,
        transactionName: TransactionNames.NO_CHALLENGE,
        inputs: [{
            transactionName: TransactionNames.PAYLOAD,
            outputIndex: 0,
            spendingConditionIndex: 0
        },
        {
            transactionName: TransactionNames.INITIAL,
            outputIndex: 0,
            spendingConditionIndex: 0
        }, {
            transactionName: TransactionNames.INITIAL,
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
        transactionName: TransactionNames.VERIFIER_WINS,
        inputs: [{
            transactionName: TransactionNames.INITIAL,
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
        transactionName: TransactionNames.SEMI_FINAL,
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
                    signatureType: SignatureType.BOTH,
                    timeoutBlocks: agentConf.smallTimeoutBlocks
                }]
            }
        ]
    },
    {
        role: AgentRoles.VERIFIER,
        transactionName: TransactionNames.FINAL,
        inputs: [
            {
                transactionName: TransactionNames.SEMI_FINAL,
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
                    signatureType: SignatureType.BOTH,
                    timeoutBlocks: agentConf.smallTimeoutBlocks
                }]
            }
        ]
    },
    {
        role: AgentRoles.PROVER,
        transactionName: 'prover_wins',
        inputs: [{
            transactionName: TransactionNames.SEMI_FINAL,
            outputIndex: 0,
            spendingConditionIndex: 1
        }, {
            transactionName: 'payload',
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
            inputs: [],
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

        state.inputs = new Array(Math.ceil(regCounts[i] / 10)).fill(0).map(j => ({
            transactionName: i == 0 ? TransactionNames.INITIAL : `${TransactionNames.SELECT}_${twoDigits(i - 1)}`,
            outputIndex: j,
            spendingConditionIndex: i == 0 && j == 0 ? 1 : 0,
        }));

        const stateTimeout: Transaction = {
            role: AgentRoles.VERIFIER,
            transactionName: `${TransactionNames.STATE_TIMEOUT}_${twoDigits(i)}`,
            inputs: [{
                transactionName: `${TransactionNames.STATE}_${twoDigits(i)}`,
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
                    nextRole: AgentRoles.VERIFIER,
                    signatureType: SignatureType.BOTH,
                    wotsSpec: [
                        WotsType._256,
                        ...new Array(iterations).fill(WotsType._1)
                    ]
                }]
            }];
        }

        const selectTimeout: Transaction = {
            role: AgentRoles.PROVER,
            transactionName: `${TransactionNames.SELECT_TIMEOUT}_${twoDigits(i)}`,
            inputs: [{
                transactionName: TransactionNames.PAYLOAD,
                outputIndex: 0,
                spendingConditionIndex: 0
            }, {
                transactionName: `${TransactionNames.SELECT}_${twoDigits(i)}`,
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

const allTransactions = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];

assertOrder(allTransactions);

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

    const payload = getTransactionByName(transactions, TransactionNames.PAYLOAD);
    payload.txId = payloadUtxo.txId;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTransactionByName(transactions, TransactionNames.PROVER_STAKE);
    proverStake.txId = proverUtxo.txId;
    proverStake.outputs[0].amount = proverUtxo.amount;

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
        if (value?.type == "Buffer" && value.data) {
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

export function writeTransactionsToFile(setupId: string, transactions: Transaction[]) {
    transactions.forEach(t => writeTransactionToFile(setupId, t));
}
export function loadTransactionFromFile(setupId: string, transactionName: string): Transaction {
    return fromJson(fs.readFileSync(`./generated/setups/${setupId}/${transactionName}.json`).toString('ascii'));
}

export function getTransactionFileNames(setupId: string): string[] {
    return fs.readdirSync(`./generated/setups/${setupId}`)
        .filter(fn => fn.endsWith('.json'))
        .map(fn => fn.replace('.json', ''));
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    initializeTransactions(AgentRoles.PROVER, 'test_setup', 1n, 2n, {
        txId: TransactionNames.PAYLOAD,
        outputIndex: 0,
        amount: agentConf.payloadAmount
    }, {
        txId: TransactionNames.PROVER_STAKE,
        outputIndex: 0,
        amount: agentConf.proverStakeAmount
    });
}
