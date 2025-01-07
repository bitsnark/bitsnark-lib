import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { addAmounts } from './amounts';
import { generateAllScripts } from './generate-scripts';
import { signTemplates, verifySignatures } from './sign-templates';
import { getSpendingConditionByInput } from '../common/templates';
import { verifySetup } from './verify-setup';
import { generateWotsPublicKeys, mergeWots, setWotsPublicKeysForArgument } from './wots-keys';
import { AgentRoles, FundingUtxo, SignatureType } from '../common/types';
import { initializeTemplates } from './init-templates';
import { AgentDb } from '../common/agent-db';
import { BitcoinNode } from '../common/bitcoin-node';
import { satsToBtc } from '../bitcoin/common';
import { createRawTx, rawTransactionToTxid, transmitRawTransaction } from '../bitcoin/external-transactions';
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

    // TODO: Fix this to not require try/catch
    try {
        console.log('creating setup...');
        await proverDb.createSetup(setupId);
        await verifierDb.createSetup(setupId);
    } catch (error) {
        console.log('setup already exists: ', setupId);
        console.log('Use npm run start-db to reset the database');
        throw error;
    }

    await proverDb.updateSetup(setupId, {
        payloadTxid: lockedFunds.txid,
        payloadTx: lockedFunds.rawTx ?? '',
        payloadOutputIndex: lockedFunds.outputIndex,
        payloadAmount: lockedFunds.amount,
        stakeTxid: proverStake.txid,
        stakeTx: proverStake.rawTx ?? '',
        stakeOutputIndex: proverStake.outputIndex,
        stakeAmount: proverStake.amount
    });

    await verifierDb.updateSetup(setupId, {
        payloadTxid: lockedFunds.txid,
        payloadTx: lockedFunds.rawTx ?? '',
        payloadOutputIndex: lockedFunds.outputIndex,
        payloadAmount: lockedFunds.amount,
        stakeTxid: proverStake.txid,
        stakeTx: proverStake.rawTx ?? '',
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

    console.log('writing templates to DB before signature verification...');

    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    await verifySignatures(proverAgentId, setupId);
    await verifySignatures(verifierAgentId, setupId);

    console.log('update listener data...');

    const currentBlockHeight = await blockchainClient.getBlockCount();
    await proverDb.updateSetupLastCheckedBlockHeight(setupId, currentBlockHeight);
    await verifierDb.updateSetupLastCheckedBlockHeight(setupId, currentBlockHeight);

    console.log('verify setups...');

    await verifySetup(proverAgentId, setupId, AgentRoles.PROVER);
    await verifySetup(verifierAgentId, setupId, AgentRoles.VERIFIER);

    console.log('mark setups as active...');

    await proverDb.markSetupPegoutActive(setupId);
    await verifierDb.markSetupPegoutActive(setupId);

    console.log('done.');
}

async function main(
    setupId: string = 'test_setup',
    proverAgentId: string = 'bitsnark_prover_1',
    verifierAgentId: string = 'bitsnark_verifier_1',
    generateFinal: boolean = false,
    lockedFundsString: string | undefined,
    proverStakeString: string | undefined
) {
    let lockedFundsTx, lockedFundsTxid, lockedFundsOutputIndex;
    if (lockedFundsString) {
        lockedFundsTxid = lockedFundsString.split(':')[0];
        lockedFundsOutputIndex = parseInt(lockedFundsString.split(':')[1]);
    } else {
        const lockedFundsAddress = createLockedFundsExternalAddresses(proverAgentId, verifierAgentId, setupId);
        lockedFundsTx = await createRawTx(lockedFundsAddress, satsToBtc(agentConf.payloadAmount));
        lockedFundsTxid = await rawTransactionToTxid(lockedFundsTx);
        lockedFundsOutputIndex = 0;
    }
    const lockedFunds: FundingUtxo = {
        txid: lockedFundsTxid,
        outputIndex: lockedFundsOutputIndex,
        amount: agentConf.payloadAmount,
        rawTx: lockedFundsTx
    };

    let proverStakeTx, proverStakeTxid, proverStakeOutputIndex;
    if (proverStakeString) {
        proverStakeTxid = proverStakeString.split(':')[0];
        proverStakeOutputIndex = parseInt(proverStakeString.split(':')[1]);
    } else {
        const proverStakeAddress = createProverStakeExternalAddresses(proverAgentId, verifierAgentId, setupId);
        proverStakeTx = await createRawTx(proverStakeAddress, satsToBtc(agentConf.proverStakeAmount));
        proverStakeTxid = await rawTransactionToTxid(proverStakeTx);
        proverStakeOutputIndex = 0;
    }
    const proverStake: FundingUtxo = {
        txid: proverStakeTxid,
        outputIndex: proverStakeOutputIndex,
        amount: agentConf.proverStakeAmount,
        rawTx: proverStakeTx
    };

    console.log('locked funds txid:', lockedFundsTxid);
    console.log('prover stake txid:', proverStakeTxid);

    await emulateSetup(proverAgentId, verifierAgentId, setupId, lockedFunds, proverStake, generateFinal);

    if (lockedFundsTx) {
        const txid = await transmitRawTransaction(lockedFundsTx);
        console.log(`locked funds sent: ${txid}`);
    }
    if (proverStakeTx) {
        await transmitRawTransaction(proverStakeTx);
        console.log(`prover stake sent: ${proverStakeTxid}`);
    }
}

if (require.main === module) {
    const {
        'prover-agent-id': proverAgentId,
        'verifier-agent-id': verifierAgentId,
        'setup-id': setupId,
        locked: lockedFunds,
        stake: proverStake,
        final: generateFinal
    } = minimist(process.argv.slice(2));
    main(setupId, proverAgentId, verifierAgentId, generateFinal, lockedFunds, proverStake).catch((error) => {
        throw error;
    });
}
