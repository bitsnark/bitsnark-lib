import { agentConf } from '../agent.conf';
import { AgentDb } from '../common/agent-db';
import { findOutputByInput, getTemplateByName } from '../common/templates';
import { AgentRoles, Template, TemplateNames } from '../common/types';

// Since we are using Python to construct the transactions, we need to know the size of each transaction.
// Except for the PROOF_REFUTED transaction, the sizes can be easily obtained with the Python `show` command.
// If you are lazy and you know it, just use this:
// echo "SELECT name FROM templates WHERE is_external = FALSE AND name <> 'PROOF_REFUTED' ORDER BY ordinal;" | \
//     psql -U postgres -h localhost bitsnark_prover_1 | head -n -2 | tail -n +3 | while read name; do
//         size="$(python -m bitsnark.cli show --setup-id test_setup --agent-id bitsnark_verifier_1 --name $name | \
//             grep -Po '(?<=^Transaction virtual size: )[0-9]*')"
//         echo "$name = $size"
//     done
const TRANSACTION_SIZES: Record<string, bigint> = {
    PROOF: 25361n,
    CHALLENGE: 154n,
    PROOF_UNCONTESTED: 379n,
    CHALLENGE_UNCONTESTED: 171n,
    STATE_00: 28494n,
    STATE_UNCONTESTED_00: 271n,
    SELECT_00: 495n,
    SELECT_UNCONTESTED_00: 163n,
    STATE_01: 28486n,
    STATE_UNCONTESTED_01: 271n,
    SELECT_01: 495n,
    SELECT_UNCONTESTED_01: 163n,
    STATE_02: 28486n,
    STATE_UNCONTESTED_02: 271n,
    SELECT_02: 495n,
    SELECT_UNCONTESTED_02: 163n,
    STATE_03: 28486n,
    STATE_UNCONTESTED_03: 271n,
    SELECT_03: 495n,
    SELECT_UNCONTESTED_03: 163n,
    STATE_04: 28486n,
    STATE_UNCONTESTED_04: 271n,
    SELECT_04: 495n,
    SELECT_UNCONTESTED_04: 163n,
    STATE_05: 28486n,
    STATE_UNCONTESTED_05: 271n,
    SELECT_05: 710n,
    SELECT_UNCONTESTED_05: 163n,
    ARGUMENT: 138164n,
    ARGUMENT_UNCONTESTED: 171n,
    // TODO: Cycle through all possible refutations and find the largest one.
    PROOF_REFUTED: 600000n
};

// Fee is: size in bytes * fee per byte * fee factor percent / 100 + 1
// We add 1 satoshi to compensate for possible flooring by BigInt division.
function calculateBytesFee(sizeInBytes: bigint): bigint {
    const requiredFee = sizeInBytes * agentConf.feePerVbyte;
    const factoredFee = (requiredFee * BigInt(agentConf.feeFactorPercent)) / 100n;
    return factoredFee + 1n;
}

export async function addAmounts(
    agentId: string,
    agentRole: AgentRoles,
    setupId: string,
    templates: Template[]
): Promise<Template[]> {
    function getExistingFee(template: Template): bigint {
        const incomingAmount = template.inputs.reduce((totalValue, input) => {
            const output = findOutputByInput(templates, input);
            if (!output.amount) setTemplateAmounts(getTemplateByName(templates, input.templateName));
            return totalValue + output.amount!;
        }, 0n);

        const outgoingAmount = template.outputs.reduce((totalValue, output) => totalValue + (output.amount || 0n), 0n);
        return incomingAmount - outgoingAmount;
    }

    function setTemplateAmounts(template: Template): Template {
        const amountlessOutputs = template.outputs.filter((output) => !output.amount);
        if (amountlessOutputs.length == 0) return template;

        // If there are multiple undefined amounts, only the first carries the real value and the rest are symbolic.
        amountlessOutputs.slice(1).forEach((output) => (output.amount = agentConf.symbolicOutputAmount));

        const currentFee = getExistingFee(template);
        const expectedFee = calculateBytesFee(TRANSACTION_SIZES[template.name]);
        amountlessOutputs[0].amount = currentFee - expectedFee;
        return template;
    }

    function validateTemplateAmounts(template: Template): void {
        if (template.outputs.some((output) => !output.amount))
            throw new Error(`Template ${template.name} has undefined output amounts`);
        const fee = getExistingFee(template);
        if (fee < 1) throw new Error(`Template ${template.name} has no fee: ${fee}`);
        const expectedFee = calculateBytesFee(TRANSACTION_SIZES[template.name]);
        if (fee < expectedFee)
            throw new Error(`Template ${template.name} has low fee: ${fee} instead of ${expectedFee}`);
        if (fee > expectedFee)
            throw new Error(`Template ${template.name} has high fee: ${fee} instead of ${expectedFee}`);
    }

    for (let template of templates) {
        // Skip externally funded templates.
        // TODO: once we find how to fund CHALLENGE we should skip it too.
        if (template.isExternal) continue;
        template = setTemplateAmounts(template);
        if (template.name == TemplateNames.CHALLENGE) continue;
        validateTemplateAmounts(template);
    }

    return templates;
}

// This should probably be in a unit test.
export function validateTemplateFees(templates: Template[]) {
    for (const template of templates) {
        // Skip externally funded templates and the challenge template.
        if (template.isExternal || template.name == TemplateNames.CHALLENGE) continue;

        if (template.outputs.some((output) => !output.amount))
            throw new Error(`Template ${template.name} has undefined output amounts`);

        const inputsValue = template.inputs.reduce(
            (totalValue, input) => totalValue + (findOutputByInput(templates, input).amount || 0n),
            0n
        );
        const outputsValue = template.outputs.reduce((totalValue, output) => totalValue + (output.amount || 0n), 0n);
        const fee = inputsValue - outputsValue;
        const requiredFee = calculateBytesFee(TRANSACTION_SIZES[template.name]);

        if (inputsValue - outputsValue < 0)
            throw new Error(`Template ${template.name} has negative value: ${inputsValue - outputsValue}`);
        if (inputsValue - outputsValue < requiredFee)
            throw new Error(`Template ${template.name} has low fee: ${inputsValue - outputsValue - fee}`);
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
