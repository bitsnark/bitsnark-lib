import Client from 'bitcoin-core';
import { AgentRoles, TemplateNames } from '../../src/agent/common/types';
import { getmockExpected, MockBlockchain, txIdBySetupAndName, mockExpected } from './bitcoin-listener-test-data';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';

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

describe('BitcoinListener', () => {
    let nodeListener: BitcoinListener;
    let clientMock: Client;

    beforeEach(() => {
        nodeListener = new BitcoinListener(AgentRoles.PROVER);

        jest.spyOn(nodeListener.db, 'query').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'updateSetupLastCheckedBlockHeightBatch').mockImplementation(jest.fn());
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

    it("Doesn't monitor transmitted if no new block is detected", async () => {
        setMocks(100, 'hash100', 100);
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it('Monitor transmitted if new block is detected', async () => {
        setMocks(100, 'hash100', 101);
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).toHaveBeenCalled();
    });

    it("Won't query for raw transaction if no pending transactions were found", async () => {
        (nodeListener.db.getReceivedTemplates as jest.Mock).mockResolvedValue([]);
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getBlock).not.toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalled();
    });

    it("Won't crawl if a new block exists but iy isn't finalizes", async () => {
        setMocks(102, 'hash102', 106);
        (nodeListener.db.getReceivedTemplates as jest.Mock).mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getBlockHash).not.toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalled();
        expect(nodeListener.client.getTxOut).not.toHaveBeenCalled();
        expect(nodeListener.db.markReceived).not.toHaveBeenCalled();
    });

    it('Will crawl if a new finalized block exists, and save txs in it', async () => {
        setMocks(107, 'hash107', 107);

        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(getmockExpected());
        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getBlockHash).toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalledWith(
            txIdBySetupAndName('test_setup_1', TemplateNames.CHALLENGE),
            expect.any(Boolean),
            'hash101'
        );
    });

    it('IF parent tx was transmitted and its inputs were spent will go over all block txs', async () => {
        setMocks(107, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
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

    it("Will not search for temporaryTxId transaction if parent published but required inputs arn't spent", async () => {
        setMocks(107, 'hash107', 107);
        setMockBlockchainSpy();
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getTxOut).toHaveBeenCalled();
        expect(nodeListener.client.getRawTransaction).not.toHaveBeenCalledTimes(4);
    });

    it('should save new published transactions found by transaction ids', async () => {
        setMocks(107, 'hash107', 107);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
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

    it('Should save new published transactions found by inputs', async () => {
        setupLastBlockProperties(nodeListener, 'hash113', 113);
        nodeListener.client = new MockBlockchain(107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        setMockBlockchainSpy();

        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);

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

    it('Should update listener height in setups', async () => {
        setupLastBlockProperties(nodeListener, 'hash109', 109);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledTimes(3);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 102);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 103);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 104);
    });
});
