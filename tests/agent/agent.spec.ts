// agent.spec.ts
import { JoinMessage, Message, StartMessage, toJson } from '../../src/agent/setup/messages';
import { Agent } from '../../src/agent/setup/agent';
import { AgentRoles } from '../../src/agent/common/types';
import { agentConf } from '../../src/agent/agent.conf';
import { SimpleContext, TelegrafContext } from '../../src/agent/setup/telegram';

export const mockAgent = {
    signMessageAndSend: jest.fn(),
    verifyMessage: jest.fn()
};

export const mockContext: SimpleContext = {
    send: jest.fn(),
    context: {} as TelegrafContext
};

const lockedFunds = {
    txId: '0000000000000000000000000000000000000000000000000000000000000000',
    outputIndex: 0,
    amount: agentConf.payloadAmount,
    external: true
};
const proverStake = {
    txId: '1111111111111111111111111111111111111111111111111111111111111111',
    outputIndex: 0,
    amount: agentConf.proverStakeAmount,
    external: true
};

//Focuses on agent message signatures; setup is checked in emulate-setups.
describe('Agents message signatures check', () => {
    const prover = new Agent('bitsnark_prover_1', AgentRoles.PROVER);
    const verifier = new Agent('bitsnark_verifier_1', AgentRoles.VERIFIER);
    let setupId: string;
    let signedMessage: Message;

    it('Prover should create a new setupInstance & send a response when a message with /start is received', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyStart = jest.spyOn(prover, 'start');
        const message = `/start`;

        await prover.messageReceived(message, mockContext);

        expect(spyStart).toHaveBeenCalledTimes(1);

        let counter = 0;
        for (const key of prover.instances.keys()) {
            setupId = key;
            counter++;
        }
        expect(setupId).toBeDefined();
        expect(counter).toBe(1);

        const messageStart = new StartMessage(prover);
        messageStart.payloadUtxo = lockedFunds;
        messageStart.proverUtxo = proverStake;
        expect(setupId).toBeDefined();
        expect(counter).toBe(1);

        messageStart.setupId = setupId;
        signedMessage = prover.signMessage(mockContext, messageStart);

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(mockContext.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Verifier on eccepting the start message, should verify it, set its setupId and send a join message', async () => {
        const spySignMessageAndSend = jest.spyOn(verifier, 'signMessageAndSend');
        const spySOntart = jest.spyOn(verifier, 'on_start');

        await verifier.messageReceived(toJson(signedMessage), mockContext);

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySOntart).toHaveBeenCalledTimes(1);
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);

        const messageJoin = new JoinMessage(verifier);
        messageJoin.setupId = setupId;
        signedMessage = verifier.signMessage(mockContext, messageJoin);
        expect(mockContext.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Prover on eccepting the join message, should verify it', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyVerifyMessage = jest.spyOn(prover, 'verifyMessage');

        await prover.messageReceived(toJson(signedMessage), mockContext);

        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(2);
        expect(spyVerifyMessage).not.toThrow('Invalid signature');
    });
});
