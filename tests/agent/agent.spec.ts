// agent.spec.ts
import { JoinMessage, Message, StartMessage, toJson } from '../../src/agent/messages';
import { Agent } from '../../src/agent/agent';
import { AgentRoles } from '../../src/agent/common';
import { ONE_BITCOIN } from '../../src/agent/agent.conf';

export const mockAgent = {
    signMessageAndSend: jest.fn(),
    verifyMessage: jest.fn()
};

export const mockCtx = {
    send: jest.fn(),
    ctx: {
        send: jest.fn()
    }
};

const lockedFunds = {
    txId: '000',
    outputIndex: 0,
    amount: ONE_BITCOIN,
    external: true
};
const proverStake = {
    txId: '111',
    outputIndex: 0,
    amount: ONE_BITCOIN,
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

        await prover.messageReceived(message, mockCtx as any);

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
        messageStart.setupId = setupId;
        signedMessage = prover.signMessage(mockCtx as any, messageStart);

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(mockCtx.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Verifier on eccepting the start message, should verify it, set its setupId and send a join message', async () => {
        const spySignMessageAndSend = jest.spyOn(verifier, 'signMessageAndSend');
        const spySOntart = jest.spyOn(verifier, 'on_start');

        await verifier.messageReceived(toJson(signedMessage), mockCtx as any);

        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);
        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySOntart).toHaveBeenCalledTimes(1);
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(1);

        const messageJoin = new JoinMessage(verifier);
        messageJoin.setupId = setupId;
        signedMessage = verifier.signMessage(mockCtx as any, messageJoin);
        expect(mockCtx.send).toHaveBeenCalledWith(signedMessage);
    });

    it('Prover on eccepting the join message, should verify it', async () => {
        const spySignMessageAndSend = jest.spyOn(prover, 'signMessageAndSend');
        const spyVerifyMessage = jest.spyOn(prover, 'verifyMessage');

        await prover.messageReceived(toJson(signedMessage), mockCtx as any);

        expect(verifier.instances.get(setupId)).toBeDefined();
        expect(spySignMessageAndSend).toHaveBeenCalledTimes(2);
        expect(spyVerifyMessage).not.toThrow('Invalid signature');
    });
});
