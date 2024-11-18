import { BitcoinNodeListener } from '../../src/agent/protocol-logic/node-listener';
import { Pending, readExpectedIncoming, updatedSetupListenerLastHeight, writeIncomingTransaction } from '../../src/agent/common/db';
import Client from 'bitcoin-core';
import { AgentRoles, TransactionNames } from '../../src/agent/common';

jest.mock('../../src/agent/common/db', () => ({
    readExpectedIncoming: jest.fn(),
    writeIncomingTransaction: jest.fn(),
    updatedSetupListenerLastHeight: jest.fn()
}));

jest.mock('bitcoin-core', () => {
    return jest.fn().mockImplementation(() => ({
        getBestBlockHash: jest.fn(),
        getBlock: jest.fn(),
        getRawTransaction: jest.fn(),
        getTransaction: jest.fn(),
        getBlockHash: jest.fn()
    }));
});

jest.mock('../../src/agent/agent.conf', () => ({
    agentConf: {
        blocksUntilFinalized: 6
    }
}));

describe('BitcoinNodeListener', () => {
    let nodeListener: BitcoinNodeListener;
    let clientMock: Client;

    beforeEach(() => {
        clientMock = new Client({
            network: 'regtest',
            username: 'user',
            password: 'pass',
            host: 'localhost',
            port: 5432
        });
        nodeListener = new BitcoinNodeListener();
        nodeListener.client = clientMock;
    });

    afterEach(() => {
        jest.clearAllMocks();
        nodeListener.destroy();
    });

    const setupLastBlockProperties = (nodeListener: BitcoinNodeListener, hash: string, height: number) => {
        Object.defineProperty(nodeListener, 'tipHash', {
            value: hash,
            writable: true
        });
        Object.defineProperty(nodeListener, 'tipHeight', {
            value: height,
            writable: true
        });
    };

    const tx1: Pending = { templateId: 1, txId: 'txId1', listenerBlockHeight: 11, setupId: 'test_493343', transactionName: TransactionNames.LOCKED_FUNDS, object: { "role": AgentRoles.PROVER, "txId": "txId1", "inputs": [], "ordinal": 0, "outputs": [{ "index": 0, "amount": 0x3b9aca00n, "spendingConditions": [] }], "setupId": "test_493343", "external": true, "protocolVersion": 0.2, "transactionName": "locked_funds" } };
    const tx2: Pending = { templateId: 2, txId: 'txId2', listenerBlockHeight: 11, setupId: 'test_493343', transactionName: TransactionNames.PROVER_STAKE, object: { "role": AgentRoles.PROVER, "txId": "txId2", "inputs": [], "ordinal": 1, "outputs": [{ "index": 0, "amount": 0xbebc200n, "spendingConditions": [] }], "setupId": "test_493343", "external": true, "protocolVersion": 0.2, "transactionName": "prover_stake" } };
    const tx3: Pending = { templateId: 200, txId: 'txId3', listenerBlockHeight: 11, setupId: 'test_493344', transactionName: TransactionNames.CHALLENGE, object: { "role": AgentRoles.PROVER, "txId": "txId3", "inputs": [], "ordinal": 0, "outputs": [{ "index": 0, "amount": 0x3b9aca00n, "spendingConditions": [] }], "setupId": "test_493344", "external": true, "protocolVersion": 0.2, "transactionName": "challenge" } };


    function getPendingTransactions() {
        return [tx1, tx2];
    }

    const Tx1Block12 = { txid: 'txId1', blockheight: 12, blockhash: 'hash12' };
    const Tx2Block12 = { txid: 'txId2', blockheight: 12, blockhash: 'hash12' };
    const Tx3Block13 = { txid: 'txId3', blockheight: 13, blockhash: 'hash13' };


    const Raw1Block12 = { txid: 'txId1' };
    const Raw2Block12 = { txid: 'txId2' };
    const Raw3Block13 = { txid: 'txId3' };


    it('Monitor transmitted if new block is detected', async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        (clientMock.getBestBlockHash as jest.Mock).mockResolvedValue('hash');
        (clientMock.getBlock as jest.Mock).mockResolvedValue({ height: 12 });
        await nodeListener.checkForNewBlock();
        expect(monitorTransmittedSpy).toHaveBeenCalled();
    });

    it("<Doesn't monitor transmitted if no new block is detected", async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        (clientMock.getBestBlockHash as jest.Mock).mockResolvedValue('');

        await nodeListener.checkForNewBlock();

        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it("Won't query for raw transaction if no pending transactions were found", async () => {
        (readExpectedIncoming as jest.Mock).mockResolvedValue([]);

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });

    it('Write to DB if new finalized transmitted are found', async () => {
        setupLastBlockProperties(nodeListener, 'hash18', 18);
        (readExpectedIncoming as jest.Mock).mockResolvedValue([tx1, tx2]);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash12');
        (clientMock.getBlock as jest.Mock).mockResolvedValue({ height: 12, tx: ['txId1', 'txId2'] });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() => Promise.resolve(Raw1Block12))
            .mockImplementationOnce(() => Promise.resolve(Raw2Block12));
        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        expect(clientMock.getRawTransaction).toHaveBeenCalledWith('txId1', true, 'hash12');
        expect(clientMock.getRawTransaction).toHaveBeenCalledWith('txId2', true, 'hash12');
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(2);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw1Block12, 12, tx1.templateId);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw2Block12, 12, tx2.templateId);
        expect(updatedSetupListenerLastHeight).toHaveBeenCalledWith(11, 12);
    });

    it('Write to DB if new finalized transmitted are found', async () => {
        setupLastBlockProperties(nodeListener, 'hash19', 19);
        (readExpectedIncoming as jest.Mock).mockResolvedValue([tx3]);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash13');
        (clientMock.getBlock as jest.Mock).mockResolvedValue({ height: 13, tx: ['txId3'] });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() => Promise.resolve(Raw3Block13));

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        expect(clientMock.getRawTransaction).toHaveBeenCalledWith('txId1', true, 'hash12');
        expect(clientMock.getRawTransaction).toHaveBeenCalledWith('txId2', true, 'hash12');
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(2);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw1Block12, 12, tx1.templateId);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw2Block12, 12, tx2.templateId);
        expect(updatedSetupListenerLastHeight).toHaveBeenCalledWith(11, 12);
    });



    // it("Ignore 'Transaction not found' error", async () => {
    //     setupLastBlockProperties(nodeListener, 'hash', 12);
    //     (readExpectedIncoming as jest.Mock).mockResolvedValue(getPendingTransactions());
    //     (clientMock.getTransaction as jest.Mock)
    //         .mockImplementationOnce(() => new Error('Transaction not found'))
    //         .mockImplementationOnce(() => Promise.resolve(Tx2Block5));

    //     (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() => Promise.resolve(Raw2Block5));

    //     await nodeListener.monitorTransmitted();

    //     expect(clientMock.getTransaction).toHaveBeenCalledTimes(2);
    //     expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(1);
    //     expect(writeIncomingTransaction).toHaveBeenCalledTimes(1);
    //     expect(writeIncomingTransaction).toHaveBeenCalledWith(Raw2Block5, Tx2Block5.blockheight, tx2.templateId);
    // });

    // it("on't write to DB if new transmitted aren't finalized", async () => {
    //     setupLastBlockProperties(nodeListener, 'hash', 12);
    //     (readExpectedIncoming as jest.Mock).mockResolvedValue(getPendingTransactions());
    //     (clientMock.getTransaction as jest.Mock)
    //         .mockImplementationOnce(() => Promise.resolve(Tx1Block12))
    //         .mockImplementationOnce(() => Promise.resolve(Tx3Block10));

    //     await nodeListener.monitorTransmitted();

    //     expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    //     expect(writeIncomingTransaction).not.toHaveBeenCalled();
    // });
});
