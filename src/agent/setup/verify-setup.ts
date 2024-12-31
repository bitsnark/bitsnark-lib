import minimist from 'minimist';
import { AgentDb } from '../common/agent-db';
import { getSpendingConditionByInput } from '../common/templates';
import { AgentRoles, SignatureType, TemplateNames } from '../common/types';
import { decodeWinternitz } from '../common/winternitz';
import { validateTransactionFees } from './amounts';
import { Agent } from 'http';

const failures: string[] = [];
function fail(msg: string) {
    console.error(msg);
    failures.push(msg);
}

export async function verifySetup(agentId: string, setupId: string, role: AgentRoles) {
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    console.log('Loaded ', templates.length, 'templates');

    console.log('check that all outputs have taproot keys');
    const taprootCheck = !templates.every((t) =>
        t.outputs.every((o) => {
            if (!o.taprootKey) fail(`Missing taproot key for ${t.name}: ${o.index}`);
            return o.taprootKey;
        })
    );
    if (taprootCheck) fail('Failed taproot check');
    else console.log('Success');

    console.log('check that all outputs have amounts');
    validateTransactionFees(templates);
    const amountCheck = templates
        .filter((t) => t.name != TemplateNames.CHALLENGE)
        .every((t) =>
            t.outputs.every((o) => {
                if (!o.amount || o.amount <= 0n) fail(`Missing amount for ${t.name}: ${o.index}`);
                return o.amount && o.amount > 0n;
            })
        );
    if (!amountCheck) fail('Failed amount check');
    else console.log('Success');

    console.log('Check that all inputs have signatures...');
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
                fail(`Missing proverSignature for ${template.name} input ${input.index}`);
            }
            if (!input.verifierSignature && verifierRequired) {
                fail(`Missing verifierSignature for ${template.name} input ${input.index}`);
            }
        }
    }
    console.warn('Not checking signature validity!!!');

    console.log('Check that all example witness parses correctly...');
    for (const template of templates) {
        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);
            if (!sc.wotsSpec || sc.nextRole != role) continue;
            console.log(template.name, input.index);
            if (!sc.exampleWitness) {
                fail(`example witness is missing for ${template.name} input ${input.index}`);
                continue;
            }
            if (!sc.wotsPublicKeys) {
                fail(`public keys missing for ${template.name} input ${input.index}`);
                continue;
            }

            // We can't check this for the argument, because the index data is supposed
            // to come from verifier....
            if (template.name == TemplateNames.ARGUMENT) continue;

            let wotsCheck = false;
            for (let dataIndex = 0; dataIndex < sc.wotsSpec.length && !wotsCheck; dataIndex++) {
                try {
                    decodeWinternitz(
                        sc.wotsSpec[dataIndex],
                        sc.exampleWitness![dataIndex],
                        sc.wotsPublicKeys![dataIndex]
                    );
                } catch (error: unknown) {
                    fail((error as Error).message ?? (error as object).toString());
                    wotsCheck = true;
                }
            }
            if (wotsCheck) fail(`Failed WOTS check for ${template.name} input ${input.index}`);
            else console.log('OK');
        }
    }

    if (failures.length) {
        console.error('Failures:\n', failures.join('\n'));
        throw new Error('Verification failed');
    }
    console.log('Success');
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args._[0] ?? args['agent-id'] ?? 'bitsnark_prover_1';
    const setupId = args._[1] ?? args['setup-id'] ?? 'test_setup';
    const role = args.role == 'verifier' ? AgentRoles.VERIFIER : AgentRoles.PROVER;
    verifySetup(agentId, setupId, role).catch((error) => {
        console.log('Error:', error);
        throw error;
    });
}
