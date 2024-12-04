import { execFileSync } from 'node:child_process';
import { AgentRoles, Template, TemplateNames } from '../common/types';
import { AgentDb } from '../common/agent-db';

export async function signTransactions(
    role: AgentRoles,
    agentId: string,
    setupId: string,
    templates: Template[]
): Promise<Template[]> {
    // On macOS, "System Integrety Protection" clears the DYLD_FALLBACK_LIBRARY_PATH,
    // which leaves the Python executable unable to find the secp256k1 library installed by Homebrew.
    if (!process.env.DYLD_FALLBACK_LIBRARY_PATH) {
        process.env.DYLD_FALLBACK_LIBRARY_PATH = '/opt/homebrew/lib:/usr/local/lib';
    }

    try {
        const result = execFileSync(
            'python3',
            [
                '-m',
                'bitsnark.core.sign_transactions',
                '--role',
                role.toLowerCase(),
                '--agent-id',
                agentId,
                '--setup-id',
                setupId
            ],
            { cwd: './python' }
        );
        console.log('done');
        console.log(result.toString());
    } catch (error: unknown) {
        const subprocessError = error as { status: number; stdout: Buffer; stderr: Buffer };
        console.error(
            `Python script failed with code ${subprocessError.status}\n` +
                `stdout:\n${subprocessError.stdout.toString()}\n` +
                `stderr:\n${subprocessError.stderr.toString()}\n`
        );
        throw error;
    }

    const db = new AgentDb(agentId);
    templates = await db.getTemplates(setupId);
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

    return templates;
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    signTransactions(AgentRoles.PROVER, agentId, setupId, templates).catch(console.error);
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
