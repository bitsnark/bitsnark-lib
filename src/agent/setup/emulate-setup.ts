import { agentConf } from '../agent.conf';
import { addAmounts } from './amounts';
import { dev_ClearTemplates, SetupStatus, writeSetupStatus, writeTemplates } from '../common/db';
import { generateAllScripts } from './generate-scripts';
import { signTransactions } from './sign-transactions';
import { initializeTransactions, mergeWots, getSpendingConditionByInput, SignatureType } from '../common/transactions';
import { verifySetup } from './verify-setup';
import { AgentRoles } from '../common/types';

export async function emulateSetup(
    proverAgentId: string,
    verifierAgentId: string,
    setupId: string,
    generateFinal: boolean
) {
    console.log('Deleting template...');
    await dev_ClearTemplates(setupId);

    console.log('Creating or updating setup status...');
    await writeSetupStatus(setupId, SetupStatus.PENDING);

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

    let proverTemplates = await initializeTransactions(
        proverAgentId,
        AgentRoles.PROVER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds,
        mockPayload
    );
    let verifierTemplates = await initializeTransactions(
        verifierAgentId,
        AgentRoles.VERIFIER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds,
        mockPayload
    );

    console.log('merging templates...');

    if (proverTemplates.length != verifierTemplates.length) throw new Error('Invalid length of template list?');

    proverTemplates = mergeWots(AgentRoles.PROVER, proverTemplates, verifierTemplates);
    verifierTemplates = mergeWots(AgentRoles.VERIFIER, verifierTemplates, proverTemplates);

    console.log('generating scripts...');

    proverTemplates = await generateAllScripts(AgentRoles.PROVER, proverTemplates, generateFinal);
    verifierTemplates = await generateAllScripts(AgentRoles.VERIFIER, verifierTemplates, generateFinal);

    console.log('adding amounts...');

    proverTemplates = await addAmounts(proverAgentId, AgentRoles.PROVER, setupId, proverTemplates);
    verifierTemplates = await addAmounts(verifierAgentId, AgentRoles.VERIFIER, setupId, verifierTemplates);

    console.log('writing templates and setting setup status to READY...');

    await writeTemplates(proverAgentId, setupId, proverTemplates);
    await writeTemplates(verifierAgentId, setupId, verifierTemplates);
    await writeSetupStatus(setupId, SetupStatus.READY);

    console.log('signing - this will create outgoing and overwrite templates...');
    // FIXME: It shouldn't really overwrite templates.

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
    await writeTemplates(proverAgentId, setupId, proverTemplates);
    await writeTemplates(verifierAgentId, setupId, verifierTemplates);

    console.log('checking...');

    await verifySetup(proverAgentId, setupId);
    await verifySetup(verifierAgentId, setupId);

    console.log('done.');
}

if (require.main === module) {
    const generateFinal = process.argv.some((s) => s == '--final');
    emulateSetup('bitsnark_prover_1', 'bitsnark_verifier_1', 'test_setup', generateFinal).catch((error) => {
        throw error;
    });
}
