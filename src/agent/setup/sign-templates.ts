import { AgentRoles, SetupStatus, SignatureType, Template, TemplateNames } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { randomBytes } from 'crypto';
import { getSpendingConditionByInput } from '../common/templates';
import { sleep } from '../common/sleep';

function verifyTemplates(templates: Template[], role: AgentRoles) {
    for (const template of templates) {
        if (template.name == TemplateNames.PROOF_REFUTED) {
            console.warn('Manually skipping checks for template', template.name);
            continue;
        }
        if (!template.txid) throw new Error('Missing txid');
        if (role == AgentRoles.PROVER && !template.inputs.every((i) => i.proverSignature))
            throw new Error('Missing signature');
        if (role == AgentRoles.VERIFIER && !template.inputs.every((i) => i.verifierSignature))
            throw new Error('Missing signature');

        // TODO: checks for fundable templates should probably not be in sign-templates
        if (template.fundable) {
            if (!template.unknownTxid) {
                throw new Error(`Fundable template ${template.name} should have unknownTxid`);
            }
            if (template.inputs.length !== 1) {
                throw new Error(`Fundable template ${template.name} should have exactly one input`);
            }
            if (template.outputs.length !== 1) {
                throw new Error(`Fundable template ${template.name} should have exactly one output`);
            }
        }
    }
}

export async function fakeSignTemplates(
    role: AgentRoles,
    agentId: string,
    setupId: string,
    templates: Template[]
): Promise<Template[]> {
    for (const template of templates) {
        if (template.isExternal) continue;
        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);
            if (sc.signatureType == SignatureType.PROVER || sc.signatureType == SignatureType.BOTH)
                input.proverSignature = randomBytes(64).toString('hex');
            if (sc.signatureType == SignatureType.VERIFIER || sc.signatureType == SignatureType.BOTH)
                input.verifierSignature = randomBytes(64).toString('hex');
        }
    }
    const agentDb = new AgentDb(agentId);
    await agentDb.updateTemplates(setupId, templates);
    return templates;
}

export async function signTemplates(
    role: AgentRoles,
    agentId: string,
    setupId: string,
    templates: Template[]
): Promise<Template[]> {
    const db = new AgentDb(agentId);
    await db.markSetupUnsigned(setupId);
    console.log('Waiting for setup to be signed (make sure signer is running: npm run bitcoin-signer)');
    do {
        const setup = await db.getSetup(setupId);
        if (setup.status == SetupStatus.SIGNED) break;
        if (setup.status == SetupStatus.FAILED) throw new Error('Setup signature failed');
    } while (await sleep(1000));

    templates = await db.getTemplates(setupId);
    verifyTemplates(templates, role);
    return templates;
}

export async function verifySignatures(agentId: string, setupId: string): Promise<void> {
    const db = new AgentDb(agentId);
    await db.markSetupMerged(setupId);
    console.log('Waiting for setup to be verified (make sure signer is running: npm run bitcoin-signer)');
    do {
        const setup = await db.getSetup(setupId);
        if (setup.status == SetupStatus.VERIFIED) return;
        if (setup.status == SetupStatus.FAILED) throw new Error('Setup verification failed');
    } while (await sleep(1000));
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    signTemplates(AgentRoles.PROVER, agentId, setupId, templates).catch(console.error);
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
