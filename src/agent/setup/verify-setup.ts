import { AgentDb } from '../common/agent-db';
import { getSpendingConditionByInput } from '../common/templates';
import { AgentRoles, SignatureType, TemplateNames } from '../common/types';
import { decodeWinternitz } from '../common/winternitz';
import { validateTransactionFees } from './amounts';

export async function verifySetup(agentId: string, setupId: string, role: AgentRoles) {
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    console.log('Loaded ', templates.length, 'templates');

    console.log('check that all outputs have taproot keys');
    const taprootCheck = !templates.every((t) =>
        t.outputs.every((o) => {
            if (!o.taprootKey) console.log('Missing taproot key', t, o);
            return o.taprootKey;
        })
    );
    if (taprootCheck) console.log('Fail');
    else console.log('Success');

    console.log('check that all outputs have amounts');
    validateTransactionFees(templates);
    const amountCheck = templates
        .filter((t) => t.name != TemplateNames.CHALLENGE)
        .every((t) =>
            t.outputs.every((o) => {
                if (!o.amount || o.amount <= 0n) console.log('Missing amount', t, o);
                return o.amount && o.amount > 0n;
            })
        );
    if (!amountCheck) console.log('Fail');
    else console.log('Success');

    console.log('check that all inputs have signatures');
    for (const template of templates) {
        if (template.isExternal || template.name == TemplateNames.PROOF_REFUTED) {
            console.warn(`Not checking signatures for ${template.name}`);
            continue;
        }

        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);
            const proverRequired = sc.signatureType === SignatureType.PROVER || sc.signatureType === SignatureType.BOTH;
            const verifierRequired =
                sc.signatureType === SignatureType.VERIFIER || sc.signatureType === SignatureType.BOTH;
            if (!input.proverSignature && proverRequired) {
                console.error(`Missing proverSignature for ${template.name} input ${input.index}`);
                console.warn(input.proverSignature);
            }
            if (!input.verifierSignature && verifierRequired) {
                console.error(`Missing verifierSignature for ${template.name} input ${input.index}`);
                console.warn(input.verifierSignature);
            }
        }
    }

    console.log('Check that all example witness parses correctly...');
    for (const template of templates) {
        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);
            if (!sc.wotsSpec || sc.nextRole != role) continue;
            console.log(template.name, input.index);
            if (!sc.exampleWitness) {
                console.log('example witness is missing');
                continue;
            }
            if (!sc.wotsPublicKeys) {
                console.log('public keys missing');
                continue;
            }
            let flag = true;
            for (let dataIndex = 0; dataIndex < sc.wotsSpec.length && flag; dataIndex++) {
                try {
                    decodeWinternitz(
                        sc.wotsSpec[dataIndex],
                        sc.exampleWitness![dataIndex],
                        sc.wotsPublicKeys![dataIndex]
                    );
                } catch (e) {
                    console.log(e);
                    flag = false;
                }
            }
            if (flag) console.log('OK');
        }
    }

    console.log('Success');
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    verifySetup('bitsnark_prover_1', 'test_setup', AgentRoles.PROVER).catch(console.error);
}
