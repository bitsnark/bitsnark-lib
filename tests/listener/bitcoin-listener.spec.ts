import Client from 'bitcoin-core';
import { AgentRoles, TemplateNames } from '../../src/agent/common/types';
import { getmockExpected, MockBlockchain, txIdBySetupAndName, mockExpected } from './bitcoin-listener-test-utils';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';
import * as utils from '../../src/agent/listener/listener-utils';

// const mockBlockchain = new MockBlockchain();

jest.mock('bitcoin-core', () => {
    return jest.fn().mockImplementation(() => ({
        getBestBlockHash: jest.fn(),
        getBlock: jest.fn(),
        getBlockCount: jest.fn(),
        getRawTransaction: jest.fn(),
        getTransaction: jest.fn(),
        getBlockHash: jest.fn(),
        getTxOut: jest.fn()
    }));
});

jest.mock('../../src/agent/agent.conf', () => ({
    agentConf: {
        blocksUntilFinalized: 6
    }
}));

jest.mock('../../src/agent/listener/listener-utils', () => ({
    getReceivedTemplates: jest.fn()
}));

describe('BitcoinListener', () => {
    let nodeListener: BitcoinListener;
    let clientMock: Client;

    beforeEach(() => {
        nodeListener = new BitcoinListener(AgentRoles.PROVER);
        jest.spyOn(nodeListener.db, 'query').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'updateSetupLastCheckedBlockHeightBatch').mockImplementation(jest.fn());
        jest.spyOn(utils, 'getReceivedTemplates').mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    function setMocks(listenerTip: number, listerHash: string, blockchainTip: number) {
        setupLastBlockProperties(nodeListener, listerHash, listenerTip);
        nodeListener.client = new MockBlockchain(blockchainTip);
        setMockBlockchainSpy();
    }

    function setMockBlockchainSpy() {
        jest.spyOn(nodeListener.client, 'getRawTransaction');
        jest.spyOn(nodeListener.client, 'getBlock');
        jest.spyOn(nodeListener.client, 'getBlockHash');
        jest.spyOn(nodeListener.client, 'getTxOut');
        jest.spyOn(nodeListener.client, 'getBlockCount');
    }

    const setupLastBlockProperties = (nodeListener: BitcoinListener, hash: string, height: number) => {
        Object.defineProperty(nodeListener, 'tipHash', { value: hash, writable: true });
        Object.defineProperty(nodeListener, 'tipHeight', { value: height, writable: true });
    };

    it('does not monitor when no new block is detected', async () => {
        setMocks(100, 'hash100', 100);
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it('calls monitorTransmitted when a new block is detected', async () => {
        setMocks(100, 'hash100', 101);
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).toHaveBeenCalled();
    });

    it('does not query for raw transactions if no pending transactions are found', async () => {
        jest.spyOn(utils, 'getReceivedTemplates').mockResolvedValue([]);
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getBlock).not.toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalled();
    });

    it('does not crawl if a new block exists but is not finalized', async () => {
        setMocks(102, 'hash102', 106);
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(getmockExpected());
        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getBlockHash).not.toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalled();
        expect(nodeListener.client.getTxOut).not.toHaveBeenCalled();
        expect(nodeListener.db.markReceived).not.toHaveBeenCalled();
    });

    it('crawls and saves transactions if a new finalized block exists', async () => {
        setMocks(107, 'hash107', 107);
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getBlockHash).toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalledWith(
            txIdBySetupAndName('test_setup_1', TemplateNames.CHALLENGE),
            expect.any(Boolean),
            'hash101'
        );
    });

    it('processes all block transactions if parent of a temporary transaction was transmitted and its outputs are spent', async () => {
        setMocks(107, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        //LOCKED_FUNDS & PROVER_STAKE are the txs in block 101
        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledWith(
            txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
            expect.any(Boolean),
            'hash101'
        );
        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledWith(
            txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
            expect.any(Boolean),
            'hash101'
        );
    });

    it('does not search for temporary transaction if the parent was transmitted but its outputs are not spent', async () => {
        setMocks(107, 'hash107', 108);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(mockExpected);
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getTxOut).toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledTimes(1);
    });

    it('saves new published transactions found by transaction IDs', async () => {
        setMocks(107, 'hash107', 107);
        const mockExpected = getmockExpected();
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(2);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.LOCKED_FUNDS,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
            expect.any(Object)
        );
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.PROVER_STAKE,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
            expect.any(Object)
        );
    });

    it('saves new published transactions found by inputs', async () => {
        setMocks(113, 'hash113', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(1);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.CHALLENGE,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
            expect.any(Object)
        );
    });

    it('updates listener height in setups', async () => {
        setMocks(109, 'hash109', 109);
        (utils.getReceivedTemplates as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledTimes(3);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 102);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 103);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 104);
    });
});
