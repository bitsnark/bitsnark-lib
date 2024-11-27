import { Pending } from '@src/agent/common/db';
import { TransactionNames } from '@src/agent/common/types';
import { Input } from '@src/agent/common/transactions';

const templates = [
    TransactionNames.LOCKED_FUNDS,
    TransactionNames.PROVER_STAKE,
    TransactionNames.PROOF,
    TransactionNames.CHALLENGE,
    TransactionNames.PROOF_UNCONTESTED
];

const IncomingTransactionsBaseRow = {
    txId: '',
    templateId: 0,
    setupId: '',
    listenerBlockHeight: 100,
    transactionName: TransactionNames.LOCKED_FUNDS,
    object: {
        txId: '',
        role: '',
        inputs: [],
        outputs: [],
        setupId: '',
        templateId: 0,
        protocolVersion: '0.2',
        transactionName: ''
    },
    protocolVersion: '0.2',
    incomingTxId: null
};

const setups = ['test_setup_1'];

export function txIdBySetupAndName(setupId: string, transactionName: string) {
    return `${setupId}_tx_${transactionName}`;
}

export const mockExpected = (function createSetupsIncomingTransactions(): Pending[] {
    return setups.flatMap((setupId, setupIndex) => {
        return templates.map((templateName, index) => {
            return {
                ...IncomingTransactionsBaseRow,
                txId: txIdBySetupAndName(setupId, templateName),
                templateId: setupIndex * 100 + index,
                transactionName: templateName,
                setupId: setupId,
                object: {
                    ...IncomingTransactionsBaseRow.object,
                    txId: txIdBySetupAndName(setupId, templateName),
                    inputs: getInputs(templateName),
                    templateId: setupIndex * 100 + index,
                    setupId: setupId,
                    transactionName: templateName,
                    temporaryTxId: templateName === TransactionNames.CHALLENGE
                }
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
        if (markIncoming?.has(expectedTx.txId)) {
            return {
                ...expectedTx,
                incomingTxId: expectedTx.txId
            };
        } else {
            return expectedTx;
        }
    });
}

export function getMockRawChallengeTx(setupId: string) {
    return {
        txid: `chalange_tx_${setupId}`,
        vin: [
            {
                txid: 'test_setup_1_tx_proof',
                vout: 1
            }
        ]
    };
}
