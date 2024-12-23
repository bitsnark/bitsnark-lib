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

    const setupId: string = fakeSetup.id;
    let signedMessage: Message;

    it('Verifier on accepting the start message, should verify it, set its setupId and send a join message', async () => {
        const messageStart = new StartMessage({
            setupId,
            agentId: prover.agentId,
            schnorrPublicKey: prover.schnorrPublicKey,
            payloadUtxo: lockedFunds,
            proverUtxo: proverStake,
            telegramMessageSig: ''
        });
        signedMessage = prover.signMessage(messageStart);

        const spySignMessageAndSend = jest.spyOn(verifier, 'signMessageAndSend');
        const spyOntart = jest.spyOn(verifier, 'on_start');

        mockVerifierDb.createSetupReturn = fakeSetup;
        await verifier.messageReceived(toJson(signedMessage), mockContext);

        expect(mockVerifierDb.createSetupCalledCount).toBe(1);
        expect(mockVerifierDb.createSetupCalledParams).toEqual({ setupId: fakeSetup.id });

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spyOntart).toHaveBeenCalledTimes(1);
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);

        const messageJoin = new JoinMessage(verifier);
        messageJoin.setupId = setupId;
        signedMessage = verifier.signMessage(messageJoin);
        expect(mockContext.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Prover on accepting the join message, should verify it', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyVerifyMessage = jest.spyOn(prover, 'verifyMessage');

        mockProverDb.getSetupReturn = fakeSetup;
        await prover.messageReceived(toJson(signedMessage), mockContext);

        expect(mockVerifierDb.getSetupCalledCount).toBe(1);
        expect(mockVerifierDb.getSetupCalledParams).toEqual({ setupId: fakeSetup.id });

        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(spyVerifyMessage).not.toThrow('Invalid signature');
    });
});
