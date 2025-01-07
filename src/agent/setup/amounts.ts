import { agentConf } from '../agent.conf';
import { AgentDb } from '../common/agent-db';
import { findOutputByInput, getTemplateByName } from '../common/templates';
import { AgentRoles, Template } from '../common/types';

// Currently only counting script sizes, not the actual transaction sizes.
// (Length input scripts + length of output scripts) / 8 bits per byte * fee per byte * fee factor percent / 100
// We add 1 satoshi to compensate for possible flooring by BigInt division.
function calculateTransactionFee(transaction: Template): bigint {
    const inputScriptsSize = transaction.inputs.reduce(
        (totalSize, input) => totalSize + (input.script?.length || 0),
        0
    );
    const outputScriptsSize = transaction.outputs.reduce(
        (totalSize, output) =>
            totalSize +
            output.spendingConditions.reduce((totalSize, condition) => totalSize + (condition.script?.length || 0), 0),
        0
    );
    const totalSize = Math.ceil((inputScriptsSize + outputScriptsSize) / 8);
    const requiredFee = BigInt(totalSize) * agentConf.feePerVbyte;
    const factoredFee = (requiredFee * BigInt(agentConf.feeFactorPercent)) / 100n;
    return factoredFee + 1n;
}

export async function addAmounts(
    agentId: string,
    agentRole: AgentRoles,
    setupId: string,
    templates: Template[]
): Promise<Template[]> {
    function addAmounts(transaction: Template): Template {
        if (transaction.isExternal) return transaction;
        const amountlessOutputs = transaction.outputs.filter((output) => !output.amount);
        if (amountlessOutputs.length == 0) return transaction;
        // If there are multiple undefined amounts, only the first carries the real value and the rest are symbolic.
        amountlessOutputs.slice(1).forEach((output) => (output.amount = agentConf.symbolicOutputAmount));

        const incomingAmount = transaction.inputs.reduce((totalValue, input) => {
            const output = findOutputByInput(templates, input);
            if (!output.amount) addAmounts(getTemplateByName(templates, input.templateName));
            return totalValue + output.amount!;
        }, 0n);

        const existingOutputsAmount = transaction.outputs.reduce(
            (totalValue, output) => totalValue + (output.amount || 0n),
            0n
        );

        amountlessOutputs[0].amount = incomingAmount - existingOutputsAmount - calculateTransactionFee(transaction);
        return transaction;
    }

    templates = templates.map(addAmounts);
    validateTransactionFees(templates);

    return templates;
}

// This should probably be in a unit test.
export function validateTransactionFees(templates: Template[]) {
    const totals = templates.reduce(
        (totals, t) => {
            if (t.outputs.some((output) => !output.amount))
                throw new Error(`Template ${t.name} has undefined output amounts`);

            // Skip externally funded templates for summing up fees.
            if (t.isExternal) return totals;

            const inputsValue = t.inputs.reduce(
                (totalValue, input) => totalValue + (findOutputByInput(templates, input).amount || 0n),
                0n
            );
            const outputsValue = t.outputs.reduce((totalValue, output) => totalValue + (output.amount || 0n), 0n);
            const fee = inputsValue - outputsValue;
            const size =
                t.inputs.reduce((totalSize, input) => totalSize + (input.script?.length || 0), 0) +
                t.outputs.reduce(
                    (totalSize, output) =>
                        totalSize +
                        output.spendingConditions.reduce(
                            (totalSize, condition) => totalSize + (condition.script?.length || 0),
                            0
                        ),
                    0
                );
            const requiredFee = calculateTransactionFee(t);

            if (inputsValue - outputsValue < 0)
                throw new Error(`Template ${t.name} has negative value: ${inputsValue - outputsValue}`);
            if (inputsValue - outputsValue < requiredFee)
                throw new Error(`Template ${t.name} has low fee: ${inputsValue - outputsValue - fee}`);
            return {
                size: totals.size + size,
                fee: totals.fee + fee
            };
        },
        { size: 0, fee: 0n }
    );

    if (totals.fee / BigInt(Math.ceil((totals.size / 8 / 100) * agentConf.feeFactorPercent)) != agentConf.feePerVbyte) {
        throw new Error(
            `Fee per byte is not correct: ` +
                `${totals.fee / BigInt(Math.ceil((totals.size / 8 / 100) * agentConf.feeFactorPercent))} ` +
                `!= ${agentConf.feePerVbyte}`
        );
    }
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const role = process.argv[2] === 'bitsnark_prover_1' || !process.argv[2] ? AgentRoles.PROVER : AgentRoles.VERIFIER;
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);
    await db.upsertTemplates(setupId, await addAmounts(agentId, role, setupId, await db.getTemplates(setupId)));
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
