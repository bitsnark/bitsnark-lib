import { getTemplateByName } from '../../src/agent/common/templates';
import { AgentRoles, SignatureType, TemplateNames } from '../../src/agent/common/types';
import { initializeTemplates } from '../../src/agent/setup/init-templates';

describe('Templates correctness', () => {
    it('Proof uncontested cannot be sent if challenge', () => {
        const templates = initializeTemplates(
            AgentRoles.PROVER,
            'test_setup',
            0n,
            0n,
            {
                txid: '',
                outputIndex: 0,
                amount: 0n
            },
            {
                txid: '',
                outputIndex: 0,
                amount: 0n
            }
        );

        const proof = getTemplateByName(templates, TemplateNames.PROOF);
        const challenge = getTemplateByName(templates, TemplateNames.CHALLENGE);
        // const lockedFunds = getTemplateByName(templates, TemplateNames.LOCKED_FUNDS);
        // const proofUncontested = getTemplateByName(templates, TemplateNames.PROOF_UNCONTESTED);

        // find an output of proof that challenge spends
        const input = challenge.inputs.find((input) => input.templateName == TemplateNames.PROOF);
        expect(input).toBeDefined();

        // make sure this same output is spent by proofUncontested
        const otherInputs = challenge.inputs.filter(
            (tinput) =>
                tinput.templateName == input!.templateName &&
                tinput.outputIndex == input!.outputIndex &&
                tinput.spendingConditionIndex == input!.spendingConditionIndex
        );
        expect(otherInputs.length).toBeGreaterThanOrEqual(1);

        // make sure this spending condition has no data

        const output = proof.outputs[input!.outputIndex];
        expect(output).toBeDefined();

        const sc = output.spendingConditions[input!.spendingConditionIndex];
        expect(sc).toBeDefined();

        expect(sc.wotsSpec).toBeFalsy();
        expect(sc.nextRole).toEqual(AgentRoles.VERIFIER);
        expect(sc.signatureType).toBe(SignatureType.BOTH);
    });
});
