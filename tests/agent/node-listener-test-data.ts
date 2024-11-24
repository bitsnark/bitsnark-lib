import { Pending } from "@src/agent/db";
import { TransactionNames } from "@src/agent/common";
import { Input } from "@src/agent/transactions-new";


const IncomingTransactionsBaseRow = {
    txId: '',
    templateId: 0,
    setupId: '',
    listenerBlockHeight: 0,
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
}

const templates = [TransactionNames.LOCKED_FUNDS,
TransactionNames.PROVER_STAKE,
TransactionNames.PROOF,
TransactionNames.CHALLENGE,
TransactionNames.PROOF_UNCONTESTED]

const setups = ['test_setup_1', 'test_setup_2'];

function txIdBySetupAndName(setupId: string, transactionName: string) {
    return `${setupId}_tx_${transactionName}`
}

const mockExpected = function createSetupsIncomingTransactions(): Pending[] {
    return setups.flatMap((setupId, setupIndex) => {
        return templates.map((templateName, index) => {
            return {
                ...IncomingTransactionsBaseRow,
                txId: txIdBySetupAndName(setupId, templateName),
                templateId: setupIndex * 100 + index,
                transactionName: templateName,
                setupId: setupId,
                object:
                {
                    ...IncomingTransactionsBaseRow.object,
                    txId: txIdBySetupAndName(setupId, templateName),
                    inputs: getInputs(templateName),
                    templateId: setupIndex * 100 + index,
                    setupId: setupId,
                    transactionName: templateName
                }
            }
        });
    });
}();


function getInputs(templateName: string): Input[] {
    if (templateName === TransactionNames.PROOF) {
        return [writeOutput(0, 0, TransactionNames.PROVER_STAKE, 0)]
    }
    if (templateName === TransactionNames.CHALLENGE) {
        return [writeOutput(0, 1, TransactionNames.PROOF, 0)]
    }
    if (templateName === TransactionNames.PROOF_UNCONTESTED) {
        return [
            writeOutput(0, 0, TransactionNames.LOCKED_FUNDS, 0),
            writeOutput(1, 0, TransactionNames.PROOF, 0),
            writeOutput(2, 1, TransactionNames.PROOF, 0)]
    }
    return []

    function writeOutput(index: number, outputIndex: number, transactionName: string, spendingConditionIndex: number) {
        return {
            index: index,
            outputIndex: outputIndex,
            transactionName: transactionName,
            spendingConditionIndex: spendingConditionIndex
        }
    }
}

const getmockExpected = (markIncoming: Set<string>) => {
    return mockExpected.map((expectedTx) => {
        if (markIncoming.has(expectedTx.txId)) {
            return {
                ...expectedTx,
                incomingTxId: expectedTx.txId
            }
        }
        else {
            return expectedTx
        }
    })
}




console.log(mockExpected);

console.log(getmockExpected(new Set([
    txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
    txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
    txIdBySetupAndName('test_setup_1', TransactionNames.PROOF),
    txIdBySetupAndName('test_setup_2', TransactionNames.LOCKED_FUNDS)])));

// export const cmockIncomingTransactions = [
//     {
//         txId: 'test_1_tx_0',
//         templateId: 397,
//         setupId: 'test_1',
//         listenerBlockHeight: 100,
//         transactionName: '',
//         object: {
//             role: AgentRoles.PROVER,
//             txId: 'test_1_tx_0',
//             inputs: [],
//             ordinal: 0,
//             outputs: [],
//             setupId: 'test_1',
//             external: true,
//             templateId: 397,
//             protocolVersion: '0.2',
//             transactionName: 'locked_funds'
//         },
//         protocolVersion: 0.2,
//         incomingTxId: null
//     },
//     {
//         txId: 'test_1_tx_1',
//         templateId: 398,
//         setupId: 'test_1',
//         listenerBlockHeight: 100,
//         transactionName: 'prover_stake',
//         object: {
//             role: 'PROVER',
//             txId: 'test_1_tx_1',
//             inputs: [],
//             ordinal: 1,
//             outputs: [],
//             setupId: 'test_1',
//             external: true,
//             templateId: 398,
//             protocolVersion: 0.2,
//             transactionName: 'prover_stake'
//         },
//         protocolVersion: '0.2',
//         incomingTxId: null
//     },
//     {
//         txId: 'test_1_tx_2',
//         templateId: 399,
//         setupId: 'test_1',
//         listenerBlockHeight: 100,
//         transactionName: 'proof',
//         object: {
//             role: 'PROVER',
//             txId: 'test_1_tx_2',
//             inputs: [
//                 {
//                     "index": 0,
//                     "outputIndex": 0,
//                     "transactionName": "prover_stake",
//                     "spendingConditionIndex": 0
//                 }
//             ],
//             ordinal: 2,
//             outputs: [],
//             setupId: 'test_1',
//             templateId: 399,
//             protocolVersion: 0.2,
//             transactionName: 'proof'
//         },
//         protocolVersion: '0.2',
//         incomingTxId: null
//     },
//     {
//         txId: 'test_1_tx_3',
//         templateId: 400,
//         setupId: 'test_1',
//         listenerBlockHeight: 100,
//         transactionName: 'challenge',
//         object: {
//             role: 'VERIFIER',
//             txId: 'test_1_tx_3',
//             "inputs": [
//                 {
//                     "index": 0,
//                     "outputIndex": 1,
//                     "transactionName": "proof",
//                     "spendingConditionIndex": 0
//                 }
//             ],
//             ordinal: 3,
//             outputs: [],
//             setupId: 'test_1',
//             templateId: 400,
//             mulableTxid: true,
//             protocolVersion: 0.2,
//             transactionName: 'challenge'
//         },
//         protocolVersion: '0.2',
//         incomingTxId: null
//     },
//     {
//         txId: 'test_1_tx_4',
//         templateId: 401,
//         setupId: 'test_1',
//         listenerBlockHeight: 1460,
//         transactionName: 'proof_uncontested',
//         object: {
//             role: 'PROVER',
//             txId: 'test_1_tx_4',
//             inputs: [
//                 {
//                     "index": 0,
//                     "outputIndex": 0,
//                     "transactionName": "locked_funds",
//                     "spendingConditionIndex": 0
//                 },
//                 {
//                     "index": 1,
//                     "nSequence": 6,
//                     "outputIndex": 0,
//                     "proverSignature": "hex:",
//                     "transactionName": "proof",
//                     "spendingConditionIndex": 0
//                 },
//                 {
//                     "index": 2,
//                     "script": "hex:",
//                     "outputIndex": 1,
//                     "proverSignature": "hex:",
//                     "transactionName": "proof",
//                     "spendingConditionIndex": 0
//                 }
//             ],
//             ordinal: 4,
//             outputs: [],
//             setupId: 'test_1',
//             templateId: 401,
//             protocolVersion: 0.2,
//             transactionName: 'proof_uncontested'
//         },
//         protocolVersion: '0.2',
//         incomingTxId: null
//     }

// ];






