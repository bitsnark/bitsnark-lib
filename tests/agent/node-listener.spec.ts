import { NodeListener } from '../../src/agent/node-listener';
import { readExpectedIncoming, writeIncomingTransaction } from '../../src/agent/db';
const Client = require('bitcoin-core');

jest.mock('../../src/agent/db', () => ({
    readExpectedIncoming: jest.fn(),
    writeIncomingTransaction: jest.fn()
}));

jest.mock('bitcoin-core', () => {
    return jest.fn().mockImplementation(() => ({
        getBestBlockHash: jest.fn(),
        getBlock: jest.fn(),
        getRawTransaction: jest.fn(),
        getTransaction: jest.fn()
    }));
});

jest.mock('../../src/agent/agent.conf', () => ({
    agentConf: {
        blocksUntilFinalized: 6
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
            writable: true
        });
        Object.defineProperty(nodeListener, 'lastBlockHeight', {
            value: height,
            writable: true
        });
    };

    const tx1 = { templateId: 1, txId: 'txId1' };
    const tx2 = { templateId: 2, txId: 'txId2' };

    function getPendingTransactions() {
        return [tx1, tx2];
    }

    const Tx1Block12 = { txid: 'txId1', blockheight: 12, blockhash: 'hash12' };
    const Tx3Block10 = { txid: 'txId3', blockheight: 10, blockhash: 'hash10' };
    const Tx2Block5 = { txid: 'txId2', blockheight: 5, blockhash: 'hash5' };

    const Raw1Block12 = { txid: 'txId1' };
    const Raw3Block10 = { txid: 'txId3' };
    const Raw2Block5 = { txid: 'txId2' };

    it('Monitor transmitted if new block is detected', async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        clientMock.getBestBlockHash.mockResolvedValue('hash');
        clientMock.getBlock.mockResolvedValue({ height: 12 });
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).toHaveBeenCalled();
    });

    it("<Doesn't monitor transmitted if no new block is detected", async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        clientMock.getBestBlockHash.mockResolvedValue('');

        await nodeListener.checkForNewBlock();

        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it("Won't query for raw transaction if no pending transactions were found", async () => {
        (readExpectedIncoming as jest.Mock).mockResolvedValue([]);

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });

    it('Write to DB if new finalized transmitted are found', async () => {
        setupLastBlockProperties(nodeListener, 'hash', 12);
        (readExpectedIncoming as jest.Mock).mockResolvedValue(getPendingTransactions());
        clientMock.getTransaction
            .mockImplementationOnce(() => Promise.resolve(Tx1Block12))
            .mockImplementationOnce(() => Promise.resolve(Tx2Block5));

        clientMock.getRawTransaction.mockImplementationOnce(() => Promise.resolve(Raw2Block5));

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTransaction).toHaveBeenCalledTimes(2);
        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(1);
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(1);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw2Block5, Tx2Block5.blockheight, tx2.templateId);
    });

    it("Ignore 'Transaction not found' error", async () => {
        setupLastBlockProperties(nodeListener, 'hash', 12);
        (readExpectedIncoming as jest.Mock).mockResolvedValue(getPendingTransactions());
        clientMock.getTransaction
            .mockImplementationOnce(() => new Error('Transaction not found'))
            .mockImplementationOnce(() => Promise.resolve(Tx2Block5));

        clientMock.getRawTransaction.mockImplementationOnce(() => Promise.resolve(Raw2Block5));

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTransaction).toHaveBeenCalledTimes(2);
        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(1);
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(1);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw2Block5, Tx2Block5.blockheight, tx2.templateId);
    });

    it("on't write to DB if new transmitted aren't finalized", async () => {
        setupLastBlockProperties(nodeListener, 'hash', 12);
        (readExpectedIncoming as jest.Mock).mockResolvedValue(getPendingTransactions());
        clientMock.getTransaction
            .mockImplementationOnce(() => Promise.resolve(Tx1Block12))
            .mockImplementationOnce(() => Promise.resolve(Tx3Block10));

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
        expect(writeIncomingTransaction).not.toHaveBeenCalled();
    });
});
