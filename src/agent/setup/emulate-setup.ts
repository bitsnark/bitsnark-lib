import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { addAmounts } from './amounts';
import { generateAllScripts } from './generate-scripts';
import { signTemplates } from './sign-templates';
import { getSpendingConditionByInput } from '../common/templates';
import { verifySetup } from './verify-setup';
import { generateWotsPublicKeys, mergeWots, setWotsPublicKeysForArgument } from './wots-keys';
import { AgentRoles, FundingUtxo, SignatureType } from '../common/types';
import { initializeTemplates } from './init-templates';
import { AgentDb } from '../common/agent-db';
import { BitcoinNode } from '../common/bitcoin-node';
import { satsToBtc } from '../bitcoin/common';
import { createFundingTxid } from '../bitcoin/external-transactions';
import { createLockedFundsExternalAddresses, createProverStakeExternalAddresses } from './create-external-addresses';

export async function emulateSetup(
    proverAgentId: string,
    verifierAgentId: string,
    setupId: string,
    lockedFunds: FundingUtxo,
    proverStake: FundingUtxo,
    generateFinal: boolean
) {
    const proverDb = new AgentDb(proverAgentId);
    const verifierDb = new AgentDb(verifierAgentId);
    const blockchainClient = new BitcoinNode().client;

    try {
        const setup = await proverDb.getSetup(setupId);
        console.log('Setup already exists: ', setupId);
        console.log('Use npm run start-db to reset the database');
        return;
    } catch (e) {
        console.log('creating setup...');
    }

    await proverDb.createSetup(setupId);
    await proverDb.updateSetup(setupId, {
        payloadTxid: lockedFunds.txid,
        payloadOutputIndex: lockedFunds.outputIndex,
        payloadAmount: lockedFunds.amount,
        stakeTxid: proverStake.txid,
        stakeOutputIndex: proverStake.outputIndex,
        stakeAmount: proverStake.amount
    });

    await verifierDb.createSetup(setupId);
    await verifierDb.updateSetup(setupId, {
        payloadTxid: lockedFunds.txid,
        payloadOutputIndex: lockedFunds.outputIndex,
        payloadAmount: lockedFunds.amount,
        stakeTxid: proverStake.txid,
        stakeOutputIndex: proverStake.outputIndex,
        stakeAmount: proverStake.amount
    });

    console.log('generating templates...');

    let proverTemplates = await initializeTemplates(
        AgentRoles.PROVER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        lockedFunds,
        proverStake
    );
    let verifierTemplates = await initializeTemplates(
        AgentRoles.VERIFIER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        lockedFunds,
        proverStake
    );
    if (proverTemplates.length != verifierTemplates.length) throw new Error('Invalid length of template list?');

    console.log('generating winternitz one-time signatures...');

    proverTemplates = generateWotsPublicKeys(setupId, proverTemplates, AgentRoles.PROVER);
    verifierTemplates = generateWotsPublicKeys(setupId, verifierTemplates, AgentRoles.VERIFIER);

    console.log('merging winternitz one-time signatures...');

    proverTemplates = mergeWots(AgentRoles.PROVER, proverTemplates, verifierTemplates);
    verifierTemplates = mergeWots(AgentRoles.VERIFIER, verifierTemplates, proverTemplates);

    console.log('setting winternitz one-time signatures for argument...');

    proverTemplates = setWotsPublicKeysForArgument(setupId, proverTemplates);
    verifierTemplates = setWotsPublicKeysForArgument(setupId, verifierTemplates);

    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    console.log('writing templates to DB before external script generation process...');

    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    console.log('generating scripts...');

    proverTemplates = await generateAllScripts(
        proverAgentId,
        setupId,
        AgentRoles.PROVER,
        proverTemplates,
        generateFinal
    );
    verifierTemplates = await generateAllScripts(
        verifierAgentId,
        setupId,
        AgentRoles.VERIFIER,
        verifierTemplates,
        generateFinal
    );

    console.log('adding amounts...');

    proverTemplates = await addAmounts(proverAgentId, AgentRoles.PROVER, setupId, proverTemplates);
    verifierTemplates = await addAmounts(verifierAgentId, AgentRoles.VERIFIER, setupId, verifierTemplates);

    console.log('writing templates to DB before external signature process...');

    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    console.log('Waiting for Python to sign transactions...');

    proverTemplates = await signTemplates(AgentRoles.PROVER, proverAgentId, setupId, proverTemplates);
    verifierTemplates = await signTemplates(AgentRoles.VERIFIER, verifierAgentId, setupId, verifierTemplates);

    console.log('merging signatures...');

    for (let i = 0; i < proverTemplates.length; i++) {
        if (proverTemplates[i].name != verifierTemplates[i].name) {
            throw new Error('Template mismatch');
        }
        for (let j = 0; j < proverTemplates[i].inputs.length; j++) {
            const spendingCondition = getSpendingConditionByInput(proverTemplates, proverTemplates[i].inputs[j]);
            if (spendingCondition.signatureType == SignatureType.BOTH) {
                proverTemplates[i].inputs[j].verifierSignature = verifierTemplates[i].inputs[j].verifierSignature;
                verifierTemplates[i].inputs[j].proverSignature = proverTemplates[i].inputs[j].proverSignature;
            }
        }
    }

    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    console.log('Update listener data...');

    const currentBlockHeight = await blockchainClient.getBlockCount();
    await proverDb.updateSetupLastCheckedBlockHeight(setupId, currentBlockHeight);
    await verifierDb.updateSetupLastCheckedBlockHeight(setupId, currentBlockHeight);

    console.log('Verify setups...');

    await verifySetup(proverAgentId, setupId, AgentRoles.PROVER);
    await verifySetup(verifierAgentId, setupId, AgentRoles.VERIFIER);

    console.log('Mark setups as active...');

    await proverDb.markSetupPegoutActive(setupId);
    await verifierDb.markSetupPegoutActive(setupId);

    console.log('done.');
}

async function main(setupId: string, generateFinal: boolean) {
    const proverAgentId = 'bitsnark_prover_1';
    const verifierAgentId = 'bitsnark_verifier_1';

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
        generateFinal
    );
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const setupId = args['setup-id'] ?? 'test_setup';
    const generateFinal = args.final;

    main(setupId, generateFinal).catch(error => console.error(error));
}
