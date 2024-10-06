import { agentConf } from "./agent.conf";
import { addAmounts, validateTransactionFees } from "./amounts";
import { AgentRoles, TransactionNames } from "./common";
import { writeTransactions } from "./db";
import { generateAllScripts } from "./generate-scripts";
import { initializeTransactions, mergeWots, Transaction } from "./transactions-new";


export async function emulateSetup(setupId: string, proverAgentId: string, verifierAgentId: string) {

    const mockLockedFunds = {
        txId: TransactionNames.LOCKED_FUNDS,
        outputIndex: 0,
        amount: agentConf.payloadAmount
    };
    const mockPayload = {
        txId: TransactionNames.PROVER_STAKE,
        outputIndex: 0,
        amount: agentConf.proverStakeAmount
    };

    console.log('generating templates...');

    const proverTemplates = await initializeTransactions(proverAgentId, AgentRoles.PROVER, 'test_setup', 1n, 2n, mockLockedFunds, mockPayload);
    const verifierTemplates = await initializeTransactions(verifierAgentId, AgentRoles.VERIFIER, 'test_setup', 1n, 2n, mockLockedFunds, mockPayload);

    console.log('merging templates...');

    if (proverTemplates.length != verifierTemplates.length)
        throw new Error('Invalid length of template list?');

    mergeWots(AgentRoles.PROVER, proverTemplates, verifierTemplates);
    await writeTransactions(proverAgentId, setupId, proverTemplates);

    mergeWots(AgentRoles.VERIFIER, verifierTemplates, proverTemplates);
    await writeTransactions(verifierAgentId, setupId, verifierTemplates);

    async function generateScripts(agentId: string, transactions: Transaction[]) {
        await generateAllScripts(agentId, setupId, transactions);
        transactions = await addAmounts(agentId, setupId);
        validateTransactionFees(transactions);
    }

    console.log('genrating scripts...');

    await generateScripts(proverAgentId, proverTemplates);
    await generateScripts(verifierAgentId, verifierTemplates);

    console.log('done.');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    emulateSetup('test_setup', 'bitsnark_prover_1', 'bitsnark_verifier_1').catch(console.error);
}
