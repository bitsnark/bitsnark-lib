import { ReceivedTemplate } from '@src/agent/listener/listener-db';
import { AgentRoles, Input, SetupStatus, TemplateNames, TemplateStatus } from '../../src/agent/common/types';

const templates = [
    TemplateNames.LOCKED_FUNDS,
    TemplateNames.PROVER_STAKE,
    TemplateNames.PROOF,
    TemplateNames.CHALLENGE,
    TemplateNames.PROOF_UNCONTESTED
];

const IncomingTransactionsBaseRow: ReceivedTemplate = {
    setupId: 'setup_id',
    txid: 'tx_id',
    setupStatus: SetupStatus.ACTIVE,
    lastCheckedBlockHeight: 100,
    name: 'transaction_name',
    role: AgentRoles.PROVER,
    isExternal: false,
    ordinal: 4,
    inputs: [],
    outputs: [],
    rawTransaction: null,
    actualTxid: null,
    blockHash: null,
    blockHeight: null,
    unknownTxid: false,
    data: null
};

const setups = ['test_setup_1'];

export function txIdBySetupAndName(setupId: string, name: string): string {
    return `${setupId}_tx_${name}`;
}

export const mockExpected = (function createSetupsIncomingTransactions(): ReceivedTemplate[] {
    return setups.flatMap((setupId, setupIndex) => {
        return templates.map((templateName, index) => {
            return {
                ...IncomingTransactionsBaseRow,
                name: templateName,
                setupId: setupId,
                txid: txIdBySetupAndName(setupId, templateName),
                templateId: setupIndex * 100 + index,
                inputs: getInputs(templateName),
                unknownTxid: templateName === TemplateNames.CHALLENGE,
                outgoingStatus: TemplateStatus.PENDING
            };
        });
    });
})();

function getInputs(templateName: string): Input[] {
    if (templateName === TemplateNames.PROOF) {
        return [getInput(0, 0, TemplateNames.PROVER_STAKE, 0)];
    }
    if (templateName === TemplateNames.CHALLENGE) {
        return [getInput(0, 1, TemplateNames.PROOF, 0)];
    }
    if (templateName === TemplateNames.PROOF_UNCONTESTED) {
        return [
            getInput(0, 0, TemplateNames.LOCKED_FUNDS, 0),
            getInput(1, 0, TemplateNames.PROOF, 0),
            getInput(2, 1, TemplateNames.PROOF, 0)
        ];
    }
    return [];

    function getInput(index: number, outputIndex: number, templateName: string, spendingConditionIndex: number) {
        return {
            index: index,
            outputIndex: outputIndex,
            templateName: templateName,
            spendingConditionIndex: spendingConditionIndex
        };
    }
}

export function getmockExpected(markIncoming?: Set<string>) {
    return mockExpected.map((expectedTx) => {
        if (markIncoming?.has(expectedTx.txid!)) {
            return {
                ...expectedTx,
                actualTxid: expectedTx.txid ?? null,
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
        txid: txIdBySetupAndName(setupId, TemplateNames.CHALLENGE),
        blockhash: blockhash,
        vin: [
            {
                txid: txIdBySetupAndName(setupId, TemplateNames.PROOF),
                vout: 1
            }
        ]
    };
}
