import { BitcoinNodeListener } from '../../src/agent/protocol-logic/node-listener';
import { readExpectedIncoming, updatedSetupListenerHeightBySetups, writeIncomingTransaction } from '../../src/agent/common/db';
import Client from 'bitcoin-core';
import { AgentRoles, TransactionNames } from '../../src/agent/common';
import { getmockExpected, getMockRawChallengeTx, txIdBySetupAndName } from './node-listener-test-data';

jest.mock('../../src/agent/common/db', () => ({
    readExpectedIncoming: jest.fn(),
    writeIncomingTransaction: jest.fn(),
    updatedSetupListenerHeightBySetups: jest.fn()
}));

jest.mock('bitcoin-core', () => {
    return jest.fn().mockImplementation(() => ({
        getBestBlockHash: jest.fn(),
        getBlock: jest.fn(),
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
        nodeListener = new BitcoinNodeListener(AgentRoles.PROVER);
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

    // const tx1: Pending = { templateId: 1, txId: 'txId1', listenerBlockHeight: 11, setupId: 'test_493343', transactionName: TransactionNames.LOCKED_FUNDS, object: { "role": AgentRoles.PROVER, "txId": "txId1", "inputs": [], "ordinal": 0, "outputs": [{ "index": 0, "amount": 0x3b9aca00n, "spendingConditions": [] }], "setupId": "test_493343", "external": true, "protocolVersion": 0.2, "transactionName": "locked_funds" } };
    // const tx2: Pending = { templateId: 2, txId: 'txId2', listenerBlockHeight: 11, setupId: 'test_493343', transactionName: TransactionNames.PROVER_STAKE, object: { "role": AgentRoles.PROVER, "txId": "txId2", "inputs": [], "ordinal": 1, "outputs": [{ "index": 0, "amount": 0xbebc200n, "spendingConditions": [] }], "setupId": "test_493343", "external": true, "protocolVersion": 0.2, "transactionName": "prover_stake" } };
    // const tx3: Pending = { templateId: 200, txId: 'txId3', listenerBlockHeight: 11, setupId: 'test_493344', transactionName: TransactionNames.CHALLENGE, object: { "role": AgentRoles.PROVER, "txId": "txId3", "inputs": [], "ordinal": 0, "outputs": [{ "index": 0, "amount": 0x3b9aca00n, "spendingConditions": [] }], "setupId": "test_493344", "external": true, "protocolVersion": 0.2, "transactionName": "challenge" } };


    // function getPendingTransactions() {
    //     return [tx1, tx2];
    // }

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

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });


    it("Won't crawel if a new block exsists but iy isn't finalizes", async () => {
        setupLastBlockProperties(nodeListener, 'hash103', 103);
        (readExpectedIncoming as jest.Mock).mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
        expect(clientMock.getTxOut).not.toHaveBeenCalled();
        expect(writeIncomingTransaction).not.toHaveBeenCalled();
    });


    it("Will crawel if a new finalized block exsists", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        (readExpectedIncoming as jest.Mock).mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).toHaveBeenCalled();
    });


    it("Will serach for all unpublished not mulable txs by transactions id", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledWith(mockExpected.find((tx) => !tx.object.mulableTxid));
    });


    it("Will serach for mulable transaction parent spend inputs", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(new Set([
            txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)]));
        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        //expect(clientMock.getRawTransaction).not.toHaveBeenCalledWith(mockExpected.find((tx) => !tx.object.mulableTxid));
    });

    it("Will not serach for mulable transaction if parent published but requiered inputs arn't spent", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(new Set([
            txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)]));
        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue({});

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledTimes(4);
    });

    it("Will serach for mulable transaction if parent published and it's requiered inputs spent", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(new Set([
            txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)]));
        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({ tx: [txIdBySetupAndName('test_setup_1', TransactionNames.CHALLENGE)] });

        (clientMock.getRawTransaction as jest.Mock)
            .mockImplementationOnce(
                () => Promise.resolve(getMockRawChallengeTx('test_setup_1')))

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledTimes(5);
    });

    it("Will save new published transactions (found by tx)", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);

        (clientMock.getRawTransaction as jest.Mock)
            .mockImplementationOnce(
                () => Promise.resolve({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS) }))
            .mockImplementationOnce(
                () => Promise.resolve({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE) }));

        await nodeListener.monitorTransmitted();
        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(2);
        expect(writeIncomingTransaction).toHaveBeenCalledWith({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS) }, 101, 0);
        expect(writeIncomingTransaction).toHaveBeenCalledWith({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE) }, 101, 1);
    });


    it("Will save new published transactions (found by inputs)", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(new Set([
            txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
            txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)]));

        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({ tx: [txIdBySetupAndName('test_setup_1', TransactionNames.CHALLENGE)] });
        (clientMock.getRawTransaction as jest.Mock)
            .mockImplementationOnce(
                () => Promise.resolve(getMockRawChallengeTx('test_setup_1')));


        await nodeListener.monitorTransmitted();
        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        expect(writeIncomingTransaction).toHaveBeenCalledTimes(1);
        expect(writeIncomingTransaction).toHaveBeenCalledWith(getMockRawChallengeTx('test_setup_1'), 101, 3);

    });


    it("Will update listener height in setups", async () => {
        setupLastBlockProperties(nodeListener, 'hash109', 109);
        const mockExpected = getmockExpected();

        (readExpectedIncoming as jest.Mock).mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(updatedSetupListenerHeightBySetups).toHaveBeenCalledTimes(3);
    });

});
