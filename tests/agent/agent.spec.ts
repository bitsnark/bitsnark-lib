// agent.spec.ts
import { JoinMessage, Message, StartMessage, toJson } from '../../src/agent/setup/messages';
import { Agent } from '../../src/agent/setup/agent';
import { AgentRoles, FundingUtxo, Setup, SetupStatus } from '../../src/agent/common/types';
import { agentConf } from '../../src/agent/agent.conf';
import { SimpleContext, TelegrafContext } from '../../src/agent/setup/telegram';
import { AgentDbMock } from '../test-utils/agent-db-mock';

export const mockAgent = {
    signMessageAndSend: jest.fn(),
    verifyMessage: jest.fn()
};

export const mockContext: SimpleContext = {
    send: jest.fn(),
    sendText: jest.fn(),
    context: {} as TelegrafContext
};

const lockedFunds: FundingUtxo = {
    txid: '0000000000000000000000000000000000000000000000000000000000000000',
    outputIndex: 0,
    amount: agentConf.payloadAmount
};
const proverStake: FundingUtxo = {
    txid: '1111111111111111111111111111111111111111111111111111111111111111',
    outputIndex: 0,
    amount: agentConf.proverStakeAmount
};
const fakeSetup: Setup = {
    id: 'test_setup',
    wotsSalt: 'salt',
    status: SetupStatus.PENDING
};

//Focuses on agent message signatures; setup is checked in emulate-setups.
describe('Agent message signatures check', () => {
    const prover = new Agent('bitsnark_prover_1', AgentRoles.PROVER);
    const mockProverDb = new AgentDbMock('bitsnark_prover_1');
    prover.db = mockProverDb;

    const verifier = new Agent('bitsnark_verifier_1', AgentRoles.VERIFIER);
    const mockVerifierDb = new AgentDbMock('bitsnark_prover_1');
    verifier.db = mockVerifierDb;

    let setupId: string;
    let signedMessage: Message;

    it('Prover should create a new setupInstance & send a response when a message with /start is received', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyStart = jest.spyOn(prover, 'start');
        const message = `/start test_setup ${lockedFunds.txid} ${lockedFunds.amount} ${proverStake.txid} ${proverStake.amount}`;

        mockProverDb.getSetupReturn = fakeSetup;
        await prover.messageReceived(message, mockContext);

        expect(spyStart).toHaveBeenCalledTimes(1);

        let counter = 0;
        for (const key of prover.instances.keys()) {
            setupId = key;
            counter++;
        }
        expect(setupId).toBeDefined();
        expect(counter).toBe(1);

        const messageStart = new StartMessage({
            setupId,
            agentId: prover.agentId,
            schnorrPublicKey: prover.schnorrPublicKey,
            payloadUtxo: lockedFunds,
            proverUtxo: proverStake,
            telegramMessageSig: ''
        });

        signedMessage = prover.signMessage(mockContext, messageStart);

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(mockContext.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Verifier on accepting the start message, should verify it, set its setupId and send a join message', async () => {
        const spySignMessageAndSend = jest.spyOn(verifier, 'signMessageAndSend');
        const spyOntart = jest.spyOn(verifier, 'on_start');

        mockVerifierDb.createSetupReturn = fakeSetup;
        await verifier.messageReceived(toJson(signedMessage), mockContext);

        expect(mockVerifierDb.createSetupCalledCount).toBe(1);
        expect(mockVerifierDb.createSetupCalledParams).toEqual({ setupId: fakeSetup.id, wotsSalt: fakeSetup.id });

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spyOntart).toHaveBeenCalledTimes(1);
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);

        const messageJoin = new JoinMessage(verifier);
        messageJoin.setupId = setupId;
        signedMessage = verifier.signMessage(mockContext, messageJoin);
        expect(mockContext.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Prover on accepting the join message, should verify it', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyVerifyMessage = jest.spyOn(prover, 'verifyMessage');

        await prover.messageReceived(toJson(signedMessage), mockContext);

        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(2);
        expect(spyVerifyMessage).not.toThrow('Invalid signature');
    });
});
