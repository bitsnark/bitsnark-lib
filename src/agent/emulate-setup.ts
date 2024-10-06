import { agentConf } from "./agent.conf";
import { AgentRoles, TransactionNames } from "./common";
import { writeTransaction } from "./db";
import { addAmounts, generateAllScripts, validateTransactionFees } from "./generate-scripts";
import { initializeTransactions, Transaction } from "./transactions-new";


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

    for (let i = 0; i < proverTemplates.length; i++) {
        const pt = proverTemplates[i];
        const vt = verifierTemplates[i];
        if (pt.transactionName != vt.transactionName || pt.outputs.length != vt.outputs.length)
            throw new Error('Incompatible template lists');
        pt.outputs.forEach((output, outputIndex) => {
            output.spendingConditions.forEach((sc, scIndex) => {
                sc.wotsPublicKeys = sc.wotsPublicKeys ?? vt.outputs[outputIndex].spendingConditions[scIndex].wotsPublicKeys;
            })
        });
        vt.outputs.forEach((output, outputIndex) => {
            output.spendingConditions.forEach((sc, scIndex) => {
                sc.wotsPublicKeys = sc.wotsPublicKeys ?? pt.outputs[outputIndex].spendingConditions[scIndex].wotsPublicKeys;
            })
        });

        await writeTransaction(proverAgentId, setupId, pt);
        await writeTransaction(verifierAgentId, setupId, vt);
    }

    async function generateScripts(agentId: string, transactions: Transaction[]) {
        await generateAllScripts(agentId, setupId, transactions);
        addAmounts(agentId, setupId, transactions);
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
