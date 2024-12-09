import { TemplateNames } from '../common/types';
import { agentConf } from '../agent.conf';
import { runPython } from '../common/python';

export async function fundExternalTemplates(
    agentId: string,
    setupId: string,
    templateNames: TemplateNames[],
    changeAddress: string = 'generate',
    feetPerVbyte: bigint = agentConf.feePerVbyte
): Promise<void> {
    const result = await runPython([
        '-m',
        'bitsnark.core.fund_transactions',
        '--rpc',
        'http://' +
            `${agentConf.bitcoinNodeUsername}:${agentConf.bitcoinNodePassword}@` +
            `${agentConf.bitcoinNodeHost}:${agentConf.bitcoinNodePort}/wallet/testwallet`,
        '--agent-id',
        agentId,
        '--setup-id',
        setupId,
        '--fee-rate',
        agentConf.feePerVbyte.toString(),
        '--change-address',
        changeAddress,
        ...templateNames
    ]);
    console.log(result.toString('ascii'));
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const templates = [TemplateNames.PROVER_STAKE, TemplateNames.LOCKED_FUNDS];
    await fundExternalTemplates(agentId, setupId, templates);
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
