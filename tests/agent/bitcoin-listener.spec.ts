import { BitcoinListener } from '../../src/agent/protocol-logic/bitcoin-listener';
import Client from 'bitcoin-core';
import { AgentRoles, TransactionNames } from '../../src/agent/common/types';
import { getmockExpected, getMockRawChallengeTx, txIdBySetupAndName } from './bitcoin-listener-test-data';

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

describe('BitcoinListener', () => {
    let nodeListener: BitcoinListener;
    let clientMock: Client;

    beforeEach(() => {
        clientMock = new Client({
            network: 'regtest',
            username: 'user',
            password: 'pass',
            host: 'localhost',
            port: 5432
        });
        nodeListener = new BitcoinListener(AgentRoles.PROVER);
        nodeListener.client = clientMock;
        jest.spyOn(nodeListener.db, 'query').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'updateLastCheckedBlockHeightBatch').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'getActiveSetups').mockResolvedValue([
            {
                id: 'setup_id',
                protocolVersion: '0.2',
                status: 5,
                lastCheckedBlockHeight: 100,
                templates: getmockExpected()
            }
        ]);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const setupLastBlockProperties = (nodeListener: BitcoinListener, hash: string, height: number) => {
        Object.defineProperty(nodeListener, 'tipHash', {
            value: hash,
            writable: true
        });
        Object.defineProperty(nodeListener, 'tipHeight', {
            value: height,
            writable: true
        });
    };

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
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue([]);

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });

    it("Won't crawel if a new block exsists but iy isn't finalizes", async () => {
        setupLastBlockProperties(nodeListener, 'hash103', 103);
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
        expect(clientMock.getTxOut).not.toHaveBeenCalled();
        expect(nodeListener.db.markReceived).not.toHaveBeenCalled();
    });

    it('Will crawel if a new finalized block exsists', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).toHaveBeenCalled();
    });

    it('Will serach for all unpublished not temporaryTxId txs by transactions id', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledWith(
            mockExpected.find((tx) => !tx.object.temporaryTxId)
        );
    });

    it('Will serach for temporaryTxId transaction parent spend inputs', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
    });

    it("Will not serach for temporaryTxId transaction if parent published but requiered inputs arn't spent", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue({});

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledTimes(4);
    });

    it("Will serach for temporaryTxId transaction if parent published and it's requiered inputs spent", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({
            tx: [txIdBySetupAndName('test_setup_1', TransactionNames.CHALLENGE)]
        });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() =>
            Promise.resolve(getMockRawChallengeTx('test_setup_1'))
        );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledTimes(5);
    });

    it('should save new published transactions found by transaction ids', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getRawTransaction as jest.Mock)
            .mockImplementationOnce(() =>
                Promise.resolve({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS) })
            )
            .mockImplementationOnce(() =>
                Promise.resolve({ txid: txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE) })
            );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(2);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            { txid: txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS) },
            101,
            0
        );
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            { txid: txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE) },
            101,
            1
        );
    });

    it('Should save new published transactions found by inputs', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TransactionNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TransactionNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({
            tx: [txIdBySetupAndName('test_setup_1', TransactionNames.CHALLENGE)]
        });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() =>
            Promise.resolve(getMockRawChallengeTx('test_setup_1'))
        );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(1);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(getMockRawChallengeTx('test_setup_1'), 101, 3);
    });

    it('Should update listener height in setups', async () => {
        setupLastBlockProperties(nodeListener, 'hash109', 109);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getExpectedTemplates').mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.updateLastCheckedBlockHeightBatch).toHaveBeenCalledTimes(3);
    });
});
