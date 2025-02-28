import minimist from 'minimist';
import {
    createLockedFundsExternalAddresses,
    createProverStakeExternalAddresses
} from '../setup/create-external-addresses';
import { emulateSetup } from '../setup/emulate-setup';
import { agentConf } from '../agent.conf';
import { createFundingTxid } from './external-transactions';
import { satsToBtc } from './common';
import { randomBytes } from 'node:crypto';

async function main() {
    const args = minimist(process.argv.slice(2));
    const proverAgentId = args['prover-agent-id'] ?? 'bitsnark_prover_1';
    const verifierAgentId = args['verifier-agent-id'] ?? 'bitsnark_verifier_1';
    const setupId = args['setup-id'] ?? randomBytes(32).toString('hex');

    const lockedFundsAddress = createLockedFundsExternalAddresses(proverAgentId, verifierAgentId, setupId);

    const proverStakeAddress = createProverStakeExternalAddresses(proverAgentId, verifierAgentId, setupId);

    const lockedFundsTxid = await createFundingTxid(lockedFundsAddress, satsToBtc(agentConf.payloadAmount));
    console.log('lockedFundsTxid:', lockedFundsTxid);

    const proverStakeTxid = await createFundingTxid(proverStakeAddress, satsToBtc(agentConf.proverStakeAmount));
    console.log('proverStakeTxid:', proverStakeTxid);

    await emulateSetup(
        proverAgentId,
        verifierAgentId,
        setupId,
        {
            txid: lockedFundsTxid,
            outputIndex: 0,
            amount: agentConf.payloadAmount
        },
        {
            txid: proverStakeTxid,
            outputIndex: 0,
            amount: agentConf.proverStakeAmount
        },
        false
    );
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
