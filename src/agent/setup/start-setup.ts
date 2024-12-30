import minimist from 'minimist';
import { AgentRoles } from '../common/types';
import { Agent } from '../setup/agent';

async function startSetup(
    agentId: string,
    setupId: string,
    lockedFundsTxid: string,
    lockedFundsAmount: bigint,
    proverStakeTxid: string,
    proverStakeAmount: bigint
) {
    console.log('Starting setup...');

    const agent = new Agent(agentId, AgentRoles.PROVER);
    await agent.start(setupId, lockedFundsTxid, BigInt(lockedFundsAmount), proverStakeTxid, BigInt(proverStakeAmount));

    console.log('Message sent.');
}

if (__filename == process.argv[1]) {
    console.log('Starting setup...');

    const args = minimist(process.argv.slice(2), {
        string: ['locked-funds-txid', 'locked-funds-amount', 'prover-stake-txid', 'prover-stake-amount']
    });
    const {
        'agent-id': agentId,
        'setup-id': setupId,
        'locked-funds-txid': lockedFundsTxid,
        'locked-funds-amount': lockedFundsAmount,
        'prover-stake-txid': proverStakeTxid,
        'prover-stake-amount': proverStakeAmount
    } = args;

    if (![agentId, setupId, lockedFundsTxid, lockedFundsAmount, proverStakeTxid, proverStakeAmount].every((t) => t)) {
        console.log('Missing parameters');
        process.exit(-1);
    }

    startSetup(agentId, setupId, lockedFundsTxid, BigInt(lockedFundsAmount), proverStakeTxid, BigInt(proverStakeAmount))
        .then(() => {
            console.log('Message sent.');
        })
        .catch((e) => console.error(e));
}
