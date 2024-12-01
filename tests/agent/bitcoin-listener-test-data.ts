import { Template, SetupStatus, OutgoingStatus } from '../../src/agent/common/db';
import { TransactionNames, AgentRoles } from '../../src/agent/common/types';
import { Input } from '../../src/agent/common/transactions';

const templates = [
    TransactionNames.LOCKED_FUNDS,
    TransactionNames.PROVER_STAKE,
    TransactionNames.PROOF,
    TransactionNames.CHALLENGE,
    TransactionNames.PROOF_UNCONTESTED
];

const IncomingTransactionsBaseRow: Template = {
    setupId: 'setup_id',
    setupStatus: SetupStatus.ACTIVE,
    protocolVersion: '0.2',
    lastCheckedBlockHeight: 100,
    name: 'name',
    role: AgentRoles.PROVER,
    isExternal: false,
    ordinal: 4,
    object: {
        txId: 'tx_id',
        role: AgentRoles.PROVER,
        inputs: [],
        outputs: [],
        setupId: 'setup_id',
        templateId: 0,
        protocolVersion: '0.2',
        transactionName: 'transaction_name'
    },
    rawTransaction: null,
    txId: null,
    blockHash: null,
    blockHeight: null
};

const setups = ['test_setup_1'];

export function txIdBySetupAndName(setupId: string, transactionName: string) {
    return `${setupId}_tx_${transactionName}`;
}

export const mockExpected = (function createSetupsIncomingTransactions(): Template[] {
    return setups.flatMap((setupId, setupIndex) => {
        return templates.map((templateName, index) => {
            return {
                ...IncomingTransactionsBaseRow,
                name: templateName,
                setupId: setupId,
                object: {
                    ...IncomingTransactionsBaseRow.object,
                    txId: txIdBySetupAndName(setupId, templateName),
                    inputs: getInputs(templateName),
                    templateId: setupIndex * 100 + index,
                    setupId: setupId,
                    transactionName: templateName,
                    temporaryTxId: templateName === TransactionNames.CHALLENGE
                },
                outgoingStatus: OutgoingStatus.PENDING
            };
        });
    });
})();

function getInputs(templateName: string): Input[] {
    if (templateName === TransactionNames.PROOF) {
        return [getInput(0, 0, TransactionNames.PROVER_STAKE, 0)];
    }
    if (templateName === TransactionNames.CHALLENGE) {
        return [getInput(0, 1, TransactionNames.PROOF, 0)];
    }
    if (templateName === TransactionNames.PROOF_UNCONTESTED) {
        return [
            getInput(0, 0, TransactionNames.LOCKED_FUNDS, 0),
            getInput(1, 0, TransactionNames.PROOF, 0),
            getInput(2, 1, TransactionNames.PROOF, 0)
        ];
    }
    return [];

    function getInput(index: number, outputIndex: number, transactionName: string, spendingConditionIndex: number) {
        return {
            index: index,
            outputIndex: outputIndex,
            transactionName: transactionName,
            spendingConditionIndex: spendingConditionIndex
        };
    }
}

export function getmockExpected(markIncoming?: Set<string>) {
    return mockExpected.map((expectedTx) => {
        if (markIncoming?.has(expectedTx.object.txId!)) {
            return {
                ...expectedTx,
                txId: expectedTx.object.txId ?? null,
                blockHash: 'block_hash',
                blockHeight: 100,
                rawTransaction: {
                    txid: '',
                    hash: 'hash',
                    hex: 'hex',
                    size: 100,
                    vsize: 100,
                    weight: 100,
                    version: 1,
                    locktime: 1,
                    vin: [],
                    vout: [],
                    blockhash: 'block_hash',
                    confirmations: 100,
                    time: 100,
                    blocktime: 100
                }
            };
        } else {
            return expectedTx;
        }
    });
}

export function getMockRawChallengeTx(setupId: string, blockhash: string) {
    return {
        txid: txIdBySetupAndName(setupId, TransactionNames.CHALLENGE),
        blockhash: blockhash,
        vin: [
            {
                txid: txIdBySetupAndName(setupId, TransactionNames.PROOF),
                vout: 1
            }
        ]
    };
}
