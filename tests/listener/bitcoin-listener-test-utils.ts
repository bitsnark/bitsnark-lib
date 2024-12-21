import { RawTransaction, TxOut, Block, Vin } from 'bitcoin-core';
import { AgentRoles, Input, TemplateNames, TemplateStatus } from '../../src/agent/common/types';
import { JoinedTemplate } from '../../src/agent/listener/listener-utils';

const templates = [
    TemplateNames.LOCKED_FUNDS,
    TemplateNames.PROVER_STAKE,
    TemplateNames.PROOF,
    TemplateNames.CHALLENGE,
    TemplateNames.PROOF_UNCONTESTED
];

const IncomingTransactionsBaseRow: JoinedTemplate = {
    setupId: 'setup_id',
    txid: 'tx_id',
    lastCheckedBlockHeight: 100,
    name: 'transaction_name',
    role: AgentRoles.PROVER,
    isExternal: false,
    ordinal: 4,
    inputs: [],
    outputs: [],
    raw: undefined,
    blockHash: undefined,
    id: 0,
    height: undefined,
    unknownTxid: false,
    protocolData: undefined
};

const emptyBlock: Block = {
    hash: '',
    confirmations: 0,
    size: 0,
    strippedsize: 0,
    weight: 0,
    height: 0,
    version: 0,
    versionHex: '',
    merkleroot: '',
    tx: [],
    time: 0,
    mediantime: 0,
    nonce: 0,
    bits: '',
    difficulty: 0,
    chainwork: '',
    nTx: 0,
    previousblockhash: undefined,
    nextblockhash: undefined
};

const emptyRawTransaction = {
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
    blockhash: 'blockHash',
    confirmations: 100,
    time: 100,
    blocktime: 100
};

const setups = ['test_setup_1'];

export function txIdBySetupAndName(setupId: string, name: string): string {
    return `${setupId}_tx_${name}`;
}
function extractNameFromTxid(str: string): string {
    const parts = str.split('_tx_');
    if (parts.length === 2) {
        return parts[1];
    }
    return '';
}

export const mockExpected = (function createSetupsIncomingTransactions(): JoinedTemplate[] {
    return setups.flatMap((setupId, setupIndex) => {
        return templates.map((templateName, index) => {
            return {
                ...IncomingTransactionsBaseRow,
                name: templateName,
                setupId: setupId,
                txid: txIdBySetupAndName(setupId, templateName),
                id: setupIndex * 100 + index,
                inputs: getInputs(templateName) as Input[],
                unknownTxid: templateName === TemplateNames.CHALLENGE,
                status: TemplateStatus.PENDING
            };
        });
    });
})();

function getInputs(templateName: string, isVin: boolean = false): (Input | Vin)[] {
    if (templateName === TemplateNames.LOCKED_FUNDS || templateName === TemplateNames.PROVER_STAKE) {
        return [getInput(0, 0, 'random_tx', 0, isVin)];
    }

    if (templateName === TemplateNames.PROOF) {
        return [getInput(0, 0, TemplateNames.PROVER_STAKE, 0, isVin)];
    }
    if (templateName === TemplateNames.CHALLENGE) {
        return [getInput(0, 1, TemplateNames.PROOF, 0, isVin)];
    }
    if (templateName === TemplateNames.PROOF_UNCONTESTED) {
        return [
            getInput(0, 0, TemplateNames.LOCKED_FUNDS, 0, isVin),
            getInput(1, 0, TemplateNames.PROOF, 0, isVin),
            getInput(2, 1, TemplateNames.PROOF, 0, isVin)
        ];
    }
    return [];

    function getInput(
        index: number,
        outputIndex: number,
        templateName: string,
        spendingConditionIndex: number,
        isVin: boolean
    ) {
        if (isVin) return getVin(templateName, outputIndex);
        return {
            index: index,
            outputIndex: outputIndex,
            templateName: templateName,
            spendingConditionIndex: spendingConditionIndex
        };
    }

    function getVin(templateName: string, index: number) {
        return {
            txid: txIdBySetupAndName('test_setup_1', templateName),
            vout: index,
            scriptSig: { asm: '', hex: '' },
            sequence: 0,
            txinwitness: []
        };
    }
}

export function getmockExpected(markIncoming?: Set<string>) {
    const copy = mockExpected.map((expectedTx) => {
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
    return JSON.parse(JSON.stringify(copy)) as JoinedTemplate[];
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

async function waitAndReturn<T>(obj: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(obj), 1));
}
export class MockBlockchain {
    private blocksToTemplates: Map<number, string[]> = new Map([
        [101, [TemplateNames.LOCKED_FUNDS, TemplateNames.PROVER_STAKE]],
        [102, [TemplateNames.PROOF]],
        [107, [TemplateNames.CHALLENGE]],
        [120, [TemplateNames.PROOF_UNCONTESTED]]
    ]);

    blockchainTip: number;
    mockBlocks: Map<number, Block> = new Map();

    constructor(blockchainTip: number) {
        this.blockchainTip = blockchainTip;
        this.mockBlocks.set(100, mockBlock(100));

        if (blockchainTip < 101) return;
        this.mockBlocks.set(101, mockBlock(101));

        if (blockchainTip < 102) return;
        this.mockBlocks.set(102, mockBlock(102));

        if (blockchainTip < 107) return;
        this.mockBlocks.set(107, mockBlock(107));

        if (blockchainTip < 120) return;
        this.mockBlocks.set(120, mockBlock(120));

        function mockBlock(blockHeight: number) {
            const blocksToTemplates: Map<number, string[]> = new Map([
                [101, [TemplateNames.LOCKED_FUNDS, TemplateNames.PROVER_STAKE]],
                [102, [TemplateNames.PROOF]],
                [107, [TemplateNames.CHALLENGE]],
                [120, [TemplateNames.PROOF_UNCONTESTED]]
            ]);
            const blockTemplates = blocksToTemplates.get(blockHeight) ?? [];
            return {
                ...emptyBlock,
                tx: blockTemplates.map((templateName) => {
                    return {
                        ...emptyRawTransaction,
                        txid: txIdBySetupAndName('test_setup_1', templateName),
                        blockhash: `hash${blockHeight}`,
                        vin: getInputs(templateName, true).flat()
                    };
                }) as RawTransaction[],
                hash: `hash${blockHeight}`,
                height: blockHeight
            } as Block;
        }
    }

    getBestBlockHash(): Promise<string> {
        if (this.mockBlocks?.get(this.blockchainTip)) {
            return waitAndReturn(this.mockBlocks.get(this.blockchainTip)!.hash);
        }
        return waitAndReturn('hash');
    }

    getBlock(blockHash: string, verbosity?: number): Promise<Block> {
        const blockHeight = parseInt(blockHash.replace('hash', ''));
        if (this.mockBlocks.get(blockHeight)) {
            // console.log('getBlock', blockHash, (this.mockBlocks.get(blockHeight)!.tx as RawTransaction[]).map(tx => tx.txid).join(','));
            return waitAndReturn(this.mockBlocks.get(blockHeight)!);
        }
        return waitAndReturn(emptyBlock);
    }

    getBlockHash(height: number): Promise<string> {
        if (this.mockBlocks.get(height)) {
            return waitAndReturn(this.mockBlocks.get(height)!.hash);
        }
        return waitAndReturn(`hash${height}`);
    }

    getRawTransaction(txid: string, verbose: boolean, blockhash: string): Promise<RawTransaction> {
        const blockHeight = parseInt(blockhash.replace('hash', ''));
        if ((this.mockBlocks.get(blockHeight)?.tx as RawTransaction[]).filter((tx) => tx.txid === txid).length > 0) {
            return waitAndReturn({
                txid: txid,
                hash: blockhash,
                hex: 'hex',
                size: 100,
                vsize: 100,
                weight: 100,
                version: 1,
                locktime: 1,
                vin: getInputs(extractNameFromTxid(txid), true) as Vin[],
                vout: [],
                blockhash: blockhash,
                confirmations: 100,
                time: 100,
                blocktime: 100
            });
        } else {
            throw new Error('Transaction not found');
        }
    }
    getBlockCount(): Promise<number> {
        return waitAndReturn(this.blockchainTip);
    }

    getTxOut(txid: string, vout: number, include_mempool: boolean): Promise<TxOut | null> {
        //only in block 107 checks assume PROOF was spent to enable PROOF_UNCONTESTED
        if (this.blockchainTip === 107) return waitAndReturn(null);
        else
            return waitAndReturn({
                bestblock: '',
                confirmations: 0,
                value: 0,
                scriptPubKey: { asm: '', hex: '', reqSigs: 0, type: '', addresses: [] },
                coinbase: false
            });
    }

    command(command: string, ...params: unknown[]): Promise<unknown> {
        return waitAndReturn('');
    }
}
