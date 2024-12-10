import minimist from 'minimist';
import { runPython } from '../common/python';

export async function broadcastTransaction(agentId: string, setupId: string, templateName: string): Promise<void> {
    const result = await runPython([
        '-m',
        'bitsnark.cli',
        'broadcast',
        '--agent-id',
        agentId,
        '--setup-id',
        setupId,
        '--name',
        templateName
    ]);
    console.log(result.toString());
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = args['agent-id'] ?? 'bitsnark_prover_1';
    const setupId = args['setup-id'] ?? 'test_setup';
    const templateName = args['name']?.toUpperCase();
    broadcastTransaction(agentId, setupId, templateName)
        .catch((error) => {
            throw error;
        })
        .then(() => {
            console.log(`Broadcasted ${templateName} transaction`);
        });
}
