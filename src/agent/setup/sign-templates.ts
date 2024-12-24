import { runPython } from '../common/python';
import { AgentRoles, SignatureType, Template, TemplateNames } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { randomBytes } from 'crypto';
import { getSpendingConditionByInput } from '../common/templates';
import { sleep } from '../common/sleep';

function verifyTemplates(templates: Template[], role: AgentRoles) {
    for (const template of templates) {
        if (template.name == TemplateNames.PROOF_REFUTED) {
            console.warn('Manually skipping script generation for template', template.name);
            continue;
        }
        if (!template.txid) throw new Error('Missing txid');
        if (role == AgentRoles.PROVER && !template.inputs.every((i) => i.proverSignature))
            throw new Error('Missing signature');
        if (role == AgentRoles.VERIFIER && !template.inputs.every((i) => i.verifierSignature))
            throw new Error('Missing signature');
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
    console.log('Waiting for setup to be signed (make sure Python DB listener is running)');
    let setup;
    do {
        setup = await db.getSetup(setupId);
        if (setup.status == 'SIGNED') break;
        if (setup.status == 'FAILED') throw new Error('Setup rejected');
    } while (!(await sleep(1000)));

    templates = await db.getTemplates(setupId);
    verifyTemplates(templates, role);
    return templates;
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
