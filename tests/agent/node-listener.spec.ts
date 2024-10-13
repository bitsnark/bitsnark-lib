import { NodeListener } from '../../src/agent/node-listener';
import { readPendingTransactions, writeTransmittedTransactions } from '../../src/agent/db';
import { resolve } from 'path';
import { agentConf } from '../../src/agent/agent.conf';
const Client = require('bitcoin-core');


jest.mock('../../src/agent/db', () => ({
    readPendingTransactions: jest.fn(),
    writeTransmittedTransactions: jest.fn(),
}));


jest.mock('bitcoin-core', () => {
    return jest.fn().mockImplementation(() => ({
        getBestBlockHash: jest.fn(),
        getBlock: jest.fn(),
        getRawTransaction: jest.fn(),
    }));
});

jest.mock('../../src/agent/agent.conf', () => ({
    agentConf: {
        blocksUntilFinalized: 6,
    }
}));

describe('NodeListener', () => {
    let nodeListener: NodeListener;
    let clientMock: jest.Mocked<typeof Client>;

    beforeEach(() => {
        clientMock = new Client();
        nodeListener = new NodeListener();
        nodeListener.client = clientMock;
    });

    afterEach(() => {
        jest.clearAllMocks();
        nodeListener.destroy();
    });

    const setupLastBlockProperties = (nodeListener: NodeListener, hash: string, height: number) => {
        Object.defineProperty(nodeListener, 'lastBlockHash', {
            value: hash,
            writable: true,
        });
        Object.defineProperty(nodeListener, 'lastBlockHeight', {
            value: height,
            writable: true,
        });
    };

    function getPendingTransactions() {
        return [
            { setupId: 'mock-test', txId: 'txId1' },
            { setupId: 'mock-test', txId: 'txId2' },
        ];
    }

    const Tx1Block12 = { txid: 'txId1', status: { confirmed: true, block_height: 12 } };
    const Tx2Block5 = { txid: 'txId2', status: { confirmed: true, block_height: 5 } };
    const Tx3Block10 = { txid: 'txId3', status: { confirmed: true, block_height: 10 } };


    it('<Monitor transmitted if new block is detected', async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        clientMock.getBestBlockHash.mockResolvedValue('hash');
        clientMock.getBlock.mockResolvedValue({ height: 12 });

        await nodeListener.checkForNewBlock();

        expect(monitorTransmittedSpy).toHaveBeenCalled();
    });

    it('<Doesn\'t monitor transmitted if no new block is detected', async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        clientMock.getBestBlockHash.mockResolvedValue('');

        await nodeListener.checkForNewBlock();

        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it('WWon\'t query for raw transaction if no pending transactions were found', async () => {
        (readPendingTransactions as jest.Mock).mockResolvedValue([]);

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });


    it('Write to DB if new finalized transmitted are found', async () => {
        setupLastBlockProperties(nodeListener, 'hash', 12);
        (readPendingTransactions as jest.Mock).mockResolvedValue(getPendingTransactions());
        clientMock.getRawTransaction
            .mockImplementationOnce(() => Promise.resolve(Tx1Block12))
            .mockImplementationOnce(() => Promise.resolve(Tx2Block5));

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        expect(writeTransmittedTransactions).toHaveBeenCalled();
        expect(writeTransmittedTransactions).toHaveBeenCalledWith([Tx2Block5]);
    });

    it('on\'t write to DB if new transmitted aren\'t finalized', async () => {
        setupLastBlockProperties(nodeListener, 'hash', 12);
        (readPendingTransactions as jest.Mock).mockResolvedValue(getPendingTransactions());
        clientMock.getRawTransaction
            .mockImplementationOnce(() => Promise.resolve(Tx1Block12))
            .mockImplementationOnce(() => Promise.resolve(Tx3Block10));

        await nodeListener.monitorTransmitted();

        expect(writeTransmittedTransactions).not.toHaveBeenCalled();
    });



});
