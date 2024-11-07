import { agentConf } from "./agent.conf";
import { addAmounts, validateTransactionFees } from "./amounts";
import { AgentRoles } from "./common";
import { clearTransactions, writeTransactions } from "./db";
import { generateAllScripts } from "./generate-scripts";
import { signTransactions } from "./sign-transactions";
import { initializeTransactions, mergeWots, Transaction } from "./transactions-new";
import { verifySetup } from "./verify-setup";


export async function emulateSetup(proverAgentId: string, verifierAgentId: string, setupId: string) {

    console.log('Deleting transactions...');
    await clearTransactions(proverAgentId, setupId);

    const mockLockedFunds = {
        txId: '0000000000000000000000000000000000000000000000000000000000000000',
        outputIndex: 0,
        amount: agentConf.payloadAmount
    };
    const mockPayload = {
        txId: '1111111111111111111111111111111111111111111111111111111111111111',
        outputIndex: 0,
        amount: agentConf.proverStakeAmount
    };

    console.log('generating templates...');

    let proverTemplates = await initializeTransactions(
        proverAgentId,
        AgentRoles.PROVER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds, mockPayload);
    let verifierTemplates = await initializeTransactions(
        verifierAgentId,
        AgentRoles.VERIFIER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        mockLockedFunds, mockPayload);

    console.log('merging templates...');

    if (proverTemplates.length != verifierTemplates.length)
        throw new Error('Invalid length of template list?');

    proverTemplates = mergeWots(AgentRoles.PROVER, proverTemplates, verifierTemplates);
    await writeTransactions(proverAgentId, setupId, proverTemplates);

    verifierTemplates = mergeWots(AgentRoles.VERIFIER, verifierTemplates, proverTemplates);
    await writeTransactions(verifierAgentId, setupId, verifierTemplates);

    async function generateScripts(agentId: string, role: AgentRoles, transactions: Transaction[]) {
        await generateAllScripts(agentId, setupId, role, transactions);
        transactions = await addAmounts(agentId, setupId);
        validateTransactionFees(transactions);
    }

    console.log('generating scripts...');

    await generateScripts(proverAgentId, AgentRoles.PROVER, proverTemplates);
    await generateScripts(verifierAgentId, AgentRoles.VERIFIER, verifierTemplates);

    console.log('adding amounts...');

    proverTemplates = await addAmounts(proverAgentId, setupId);
    verifierTemplates = await addAmounts(verifierAgentId, setupId);

    console.log('signing...');

    proverTemplates = await signTransactions(AgentRoles.PROVER, proverAgentId, setupId, proverTemplates);
    verifierTemplates = await signTransactions(AgentRoles.VERIFIER, verifierAgentId, setupId, verifierTemplates);

    console.log('checking...');

    await verifySetup(proverAgentId, setupId);
    await verifySetup(verifierAgentId, setupId);

    console.log('done.');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    emulateSetup('bitsnark_prover_1', 'bitsnark_verifier_1', 'test_setup').catch(console.error);
}
