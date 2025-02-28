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
    getTemplatesRows: jest.fn()
}));

describe('BitcoinListener', () => {
    let nodeListener: BitcoinListener;

    beforeEach(() => {
        nodeListener = new BitcoinListener(AgentRoles.PROVER);
        jest.spyOn(nodeListener.db, 'query').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'updateSetupLastCheckedBlockHeightBatch').mockImplementation(jest.fn());
        jest.spyOn(utils, 'getTemplatesRows').mockImplementation(jest.fn());
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    function setMocks(listenerTip: number, listenerHash: string, blockchainTip: number) {
        setupLastBlockProperties(nodeListener, listenerHash, listenerTip);
        nodeListener.client = new MockBlockchain(blockchainTip);
        setMockBlockchainSpy();
    }

    function setMockBlockchainSpy() {
        jest.spyOn(nodeListener.client, 'getBlock');
        jest.spyOn(nodeListener.client, 'getBlockHash');
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
        jest.spyOn(utils, 'getTemplatesRows').mockResolvedValue([]);
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getBlock).not.toHaveBeenCalled();
    });

    it('does not crawl if a new block exists but is not finalized', async () => {
        setMocks(102, 'hash102', 106);
        (utils.getTemplatesRows as jest.Mock).mockResolvedValue(getmockExpected());
        await nodeListener.monitorTransmitted();

        expect(nodeListener.client.getBlockHash).not.toHaveBeenCalled();
        expect(nodeListener.db.markReceived).not.toHaveBeenCalled();
    });

    it('crawls and saves transactions if a new finalized block exists', async () => {
        setMocks(107, 'hash107', 107);
        (utils.getTemplatesRows as jest.Mock).mockResolvedValue(getmockExpected());
        await nodeListener.monitorTransmitted();
        expect(nodeListener.client.getBlockHash).toHaveBeenCalled();
    });

    it('saves new published transactions found by transaction IDs', async () => {
        setMocks(107, 'hash107', 107);
        const mockExpected = getmockExpected();
        (utils.getTemplatesRows as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(2);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            expect.objectContaining({
                setupId: 'test_setup_1',
                name: TemplateNames.LOCKED_FUNDS
            }),
            101,
            'hash101',
            expect.objectContaining({
                txid: 'test_setup_1_tx_LOCKED_FUNDS',
                blockhash: 'hash101'
            }),
            0
        );
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            expect.objectContaining({
                setupId: 'test_setup_1',
                name: TemplateNames.PROVER_STAKE
            }),
            101,
            'hash101',
            expect.objectContaining({
                txid: 'test_setup_1_tx_PROVER_STAKE',
                blockhash: 'hash101'
            }),
            1
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
        (utils.getTemplatesRows as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(1);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            expect.objectContaining({
                setupId: 'test_setup_1',
                name: TemplateNames.CHALLENGE
            }),
            107,
            'hash107',
            expect.objectContaining({
                txid: 'test_setup_1_tx_CHALLENGE',
                blockhash: 'hash107',
                vin: expect.arrayContaining([expect.objectContaining({ txid: 'test_setup_1_tx_PROOF' })])
            }),
            0
        );
    });

    it('updates listener height in setups', async () => {
        setMocks(109, 'hash109', 100);
        (utils.getTemplatesRows as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledTimes(3);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 101);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 102);
        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledWith(['test_setup_1'], 103);
    });
});
