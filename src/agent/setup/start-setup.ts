import minimist from 'minimist';
import { AgentRoles, SetupStatus } from '../common/types';
import { Agent } from '../setup/agent';
import { agentConf } from '../agent.conf';
import { createLockedFundsExternalAddresses, createProverStakeExternalAddresses } from './create-external-addresses';
import { createRawTx, rawTransactionToTxid } from '../bitcoin/external-transactions';
import { satsToBtc } from '../bitcoin/common';

export async function startSetup(proverAgentId: string, verifierAgentId: string, setupId: string) {
    console.log('Starting setup...');

    const lockedFundsAddress = createLockedFundsExternalAddresses(proverAgentId, verifierAgentId, setupId);
    const lockedFundsTx = await createRawTx(lockedFundsAddress, satsToBtc(agentConf.payloadAmount));
    const lockedFundsTxid = await rawTransactionToTxid(lockedFundsTx);

    const proverStakeAddress = createProverStakeExternalAddresses(proverAgentId, verifierAgentId, setupId);
    const proverStakeTx = await createRawTx(proverStakeAddress, satsToBtc(agentConf.proverStakeAmount));
    const proverStakeTxid = await rawTransactionToTxid(proverStakeTx);

    const agent = new Agent(proverAgentId, AgentRoles.PROVER);
    await agent.start(
        setupId,
        lockedFundsTxid,
        lockedFundsTx,
        agentConf.payloadAmount,
        proverStakeTxid,
        proverStakeTx,
        agentConf.proverStakeAmount
    );

    console.log('Message sent.');
}

if (__filename == process.argv[1]) {
    console.log('Starting setup...');

    const args = minimist(process.argv.slice(2));
    const { 'prover-agent-id': proverAgentId, 'verifier-agent-id': verifierAgentId, 'setup-id': setupId } = args;

    if (!proverAgentId || !agentConf.keyPairs[proverAgentId]) {
        console.error('Prover agent not found in config:', proverAgentId);
        process.exit(1);
    }

    if (!verifierAgentId || !agentConf.keyPairs[verifierAgentId]) {
        console.error('Verifier agent not found in config:', verifierAgentId);
        process.exit(1);
    }

    startSetup(proverAgentId, verifierAgentId, setupId)
        .then(() => {
            console.log('Message sent.');
        })
        .catch((e) => console.error(e));
}
