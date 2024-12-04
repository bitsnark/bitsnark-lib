import Client from 'bitcoin-core';
import { AgentRoles, TemplateNames } from '../../src/agent/common/types';
import { getmockExpected, getMockRawChallengeTx, txIdBySetupAndName } from './bitcoin-listener-test-data';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';

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
        jest.spyOn(nodeListener.db, 'getTemplates').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        jest.spyOn(nodeListener.db, 'updateSetupLastCheckedBlockHeightBatch').mockImplementation(jest.fn());
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

    it("Doesn't monitor transmitted if no new block is detected", async () => {
        const monitorTransmittedSpy = jest.spyOn(nodeListener, 'monitorTransmitted').mockResolvedValue(undefined);
        (clientMock.getBestBlockHash as jest.Mock).mockResolvedValue('');

        await nodeListener.checkForNewBlock();

        expect(monitorTransmittedSpy).not.toHaveBeenCalled();
    });

    it("Won't query for raw transaction if no pending transactions were found", async () => {
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue([]);

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
    });

    it("Won't crawl if a new block exists but iy isn't finalizes", async () => {
        setupLastBlockProperties(nodeListener, 'hash103', 103);
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).not.toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalled();
        expect(clientMock.getTxOut).not.toHaveBeenCalled();
        expect(nodeListener.db.markReceived).not.toHaveBeenCalled();
    });

    it('Will crawl if a new finalized block exists', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(getmockExpected());

        await nodeListener.monitorTransmitted();

        expect(clientMock.getBlockHash).toHaveBeenCalled();
    });

    it('Will serach for all unpublished not temporaryTxId txs by transactions id', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledWith(mockExpected.find((tx) => !tx.unknownTxid));
    });

    it('Will serach for temporaryTxId transaction parent spend inputs', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
    });

    it("Will not serach for temporaryTxId transaction if parent published but requiered inputs arn't spent", async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
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
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({
            tx: [txIdBySetupAndName('test_setup_1', TemplateNames.CHALLENGE)]
        });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() =>
            Promise.resolve(getMockRawChallengeTx('test_setup_1', 'hash101'))
        );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getTxOut).toHaveBeenCalled();
        expect(clientMock.getRawTransaction).not.toHaveBeenCalledTimes(5);
    });

    it('should save new published transactions found by transaction ids', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getRawTransaction as jest.Mock)
            .mockImplementationOnce(() =>
                Promise.resolve({
                    txid: txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                    blockhash: 'hash101'
                })
            )
            .mockImplementationOnce(() =>
                Promise.resolve({
                    txid: txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                    blockhash: 'hash101'
                })
            );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(4);
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockImplementation(jest.fn());
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(2);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.LOCKED_FUNDS,
            txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
            'hash101',
            101,
            { txid: txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS), blockhash: 'hash101' }
        );

        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.PROVER_STAKE,
            txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
            'hash101',
            101,
            { txid: txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE), blockhash: 'hash101' }
        );
    });

    it('Should save new published transactions found by inputs', async () => {
        setupLastBlockProperties(nodeListener, 'hash107', 107);
        const mockExpected = getmockExpected(
            new Set([
                txIdBySetupAndName('test_setup_1', TemplateNames.LOCKED_FUNDS),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROVER_STAKE),
                txIdBySetupAndName('test_setup_1', TemplateNames.PROOF)
            ])
        );
        jest.spyOn(nodeListener.db, 'getReceivedTemplates').mockResolvedValue(mockExpected);
        (clientMock.getBlockHash as jest.Mock).mockResolvedValue('hash101');
        (clientMock.getTxOut as jest.Mock).mockResolvedValue(null);
        (clientMock.getBlock as jest.Mock).mockResolvedValue({
            tx: [txIdBySetupAndName('test_setup_1', TemplateNames.CHALLENGE)]
        });
        (clientMock.getRawTransaction as jest.Mock).mockImplementationOnce(() =>
            Promise.resolve(getMockRawChallengeTx('test_setup_1', 'hash101'))
        );

        await nodeListener.monitorTransmitted();

        expect(clientMock.getRawTransaction).toHaveBeenCalledTimes(2);
        jest.spyOn(nodeListener.db, 'markReceived').mockImplementation(jest.fn());
        expect(nodeListener.db.markReceived).toHaveBeenCalledTimes(1);
        expect(nodeListener.db.markReceived).toHaveBeenCalledWith(
            'test_setup_1',
            TemplateNames.CHALLENGE,
            txIdBySetupAndName('test_setup_1', TemplateNames.CHALLENGE),
            'hash101',
            101,
            getMockRawChallengeTx('test_setup_1', 'hash101')
        );
    });

    it('Should update listener height in setups', async () => {
        setupLastBlockProperties(nodeListener, 'hash109', 109);
        const mockExpected = getmockExpected();
        jest.spyOn(nodeListener.db, 'getTemplates').mockResolvedValue(mockExpected);

        await nodeListener.monitorTransmitted();

        expect(nodeListener.db.updateSetupLastCheckedBlockHeightBatch).toHaveBeenCalledTimes(3);
    });
});
