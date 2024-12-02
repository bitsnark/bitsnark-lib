import { agentConf } from '../agent.conf';
import { addAmounts } from './amounts';
import { generateAllScripts } from './generate-scripts';
import { signTransactions } from './sign-transactions';
import { getSpendingConditionByInput, SignatureType } from '../common/transactions';
import { verifySetup } from './verify-setup';
import { generateWotsPublicKeys, mergeWots, setWotsPublicKeysForArgument } from './wots-keys';
import { AgentRoles } from '../common/types';
import { initializeTemplates } from './init-templates';
import { AgentDb } from '../common/db';
import { TEST_WOTS_SALT } from '@tests/test-utils';

export async function emulateSetup(
    proverAgentId: string,
    verifierAgentId: string,
    setupId: string,
    generateFinal: boolean
) {
    const proverDb = new AgentDb(proverAgentId);
    const verifierDb = new AgentDb(verifierAgentId);

    const mockLockedFunds = {
        txId: '0000000000000000000000000000000000000000000000000000000000000000',
        outputIndex: 0,
        amount: agentConf.payloadAmount,
        external: true
    };
    const mockPayload = {
        txId: '1111111111111111111111111111111111111111111111111111111111111111',
        outputIndex: 0,
        amount: agentConf.proverStakeAmount,
        external: true
    };

    console.log('generating templates...');

    let proverTemplates = await initializeTemplates(
        AgentRoles.PROVER,
        setupId,
        TEST_WOTS_SALT,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds,
        mockPayload
    );
    let verifierTemplates = await initializeTemplates(
        AgentRoles.VERIFIER,
        setupId,
        TEST_WOTS_SALT,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds,
        mockPayload
    );

    console.log('merging templates...');

    if (proverTemplates.length != verifierTemplates.length) throw new Error('Invalid length of template list?');

    generateWotsPublicKeys(setupId, proverTemplates, AgentRoles.PROVER);
    generateWotsPublicKeys(setupId, verifierTemplates, AgentRoles.VERIFIER);

    proverTemplates = mergeWots(AgentRoles.PROVER, proverTemplates, verifierTemplates);
    verifierTemplates = mergeWots(AgentRoles.VERIFIER, verifierTemplates, proverTemplates);

    setWotsPublicKeysForArgument(setupId, proverTemplates);
    setWotsPublicKeysForArgument(setupId, verifierTemplates);

    console.log('generating scripts...');

    proverTemplates = await generateAllScripts(AgentRoles.PROVER, proverTemplates, generateFinal);
    verifierTemplates = await generateAllScripts(AgentRoles.VERIFIER, verifierTemplates, generateFinal);

    console.log('adding amounts...');

    proverTemplates = await addAmounts(proverAgentId, AgentRoles.PROVER, setupId, proverTemplates);
    verifierTemplates = await addAmounts(verifierAgentId, AgentRoles.VERIFIER, setupId, verifierTemplates);

    console.log('Creating setup...');

    await proverDb.insertNewSetup(setupId, proverTemplates);
    await verifierDb.insertNewSetup(setupId, verifierTemplates);

    console.log('Signing transactions - this will overwrite templates...');

    proverTemplates = await signTransactions(AgentRoles.PROVER, proverAgentId, setupId, proverTemplates);
    verifierTemplates = await signTransactions(AgentRoles.VERIFIER, verifierAgentId, setupId, verifierTemplates);

    console.log('merging signatures...');
    for (const [templateIdx, proverTemplate] of proverTemplates.entries()) {
        if (verifierTemplates[templateIdx].transactionName != proverTemplate.transactionName) {
            throw new Error('Template mismatch');
        }
        for (const [inputIdx, proverInput] of proverTemplate.inputs.entries()) {
            const spendingCondition = getSpendingConditionByInput(proverTemplates, proverInput);
            if (spendingCondition.signatureType == SignatureType.BOTH) {
                const verifierInput = verifierTemplates[templateIdx].inputs[inputIdx];
                proverInput.verifierSignature = verifierInput.verifierSignature;
                verifierInput.proverSignature = proverInput.proverSignature;
            }
        }
    }
    await proverDb.upsertTemplates(setupId, proverTemplates);
    await verifierDb.upsertTemplates(setupId, verifierTemplates);

    console.log('Update listener data...');

    await proverDb.updateLastCheckedBlockHeight(setupId, 100);
    await verifierDb.updateLastCheckedBlockHeight(setupId, 100);

    console.log('Verify setups...');

    await verifySetup(proverAgentId, setupId, AgentRoles.PROVER);
    await verifySetup(verifierAgentId, setupId, AgentRoles.VERIFIER);

    console.log('done.');
}

if (require.main === module) {
    const generateFinal = process.argv.some((s) => s == '--final');
    emulateSetup('bitsnark_prover_1', 'bitsnark_verifier_1', 'test_setup', generateFinal).catch((error) => {
        throw error;
    });
}
