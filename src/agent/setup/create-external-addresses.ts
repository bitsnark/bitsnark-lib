import minimist from 'minimist';
import { agentConf } from '../agent.conf';
import { AgentRoles, SignatureType, Template, TemplateNames } from '../common/types';
import { SimpleTapTree } from '../common/taptree';
import { generateWotsPublicKeysForSpendingCondition } from './wots-keys';
import { generateBoilerplate } from './generate-scripts';
import { protocolStart } from '../common/templates';

export function createExternalAddresses(proverAgentId: string, verifierAgentId: string, setupId: string) {
    const proverPublicKey = Buffer.from(agentConf.keyPairs[proverAgentId].schnorrPublic, 'hex');
    const verifierPublicKey = Buffer.from(agentConf.keyPairs[verifierAgentId].schnorrPublic, 'hex');

    function getTemplateTaprootAddress(template: Template): string {
        if (template.outputs.length != 1 || template.outputs[0].spendingConditions.length != 1)
            throw new Error(`Invalid template structure: ${template.name}`);

        const sc = template.outputs[0].spendingConditions[0];
        sc.signaturesPublicKeys = {
            [SignatureType.NONE]: [],
            [SignatureType.BOTH]: [proverPublicKey, verifierPublicKey],
            [SignatureType.PROVER]: [proverPublicKey],
            [SignatureType.VERIFIER]: [verifierPublicKey]
        }[sc.signatureType];
        generateWotsPublicKeysForSpendingCondition(setupId, TemplateNames.PROOF, sc, 0, 0);
        const script = generateBoilerplate(AgentRoles.PROVER, sc, {
            templateName: TemplateNames.LOCKED_FUNDS,
            outputIndex: 0,
            spendingConditionIndex: 0
        });
        const stt = new SimpleTapTree(agentConf.internalPubkey, [script]);
        return stt.getTaprootAddress();
    }

    const lockedFunds = protocolStart.find((t) => t.name == TemplateNames.LOCKED_FUNDS);
    if (!lockedFunds) throw new Error('Locked funds template not found');
    const lockedFundsAddress = getTemplateTaprootAddress(lockedFunds);
    console.log('lockedFundsAddress: ', lockedFundsAddress);

    const proverStake = protocolStart.find((t) => t.name == TemplateNames.PROVER_STAKE);
    if (!proverStake) throw new Error('Locked funds template not found');
    const proverStakeAddress = getTemplateTaprootAddress(proverStake);
    console.log('proverStakeAddress: ', proverStakeAddress);
}

async function main() {
    const args = minimist(process.argv.slice(2));
    const proverAgentId = 'bitsnark_prover_1';
    const verifierAgentId = 'bitsnark_verifier_1';
    const setupId = args._[0] ?? args['setup-id'] ?? 'test_setup';
    console.log('setupId: ', setupId);

    createExternalAddresses(proverAgentId, verifierAgentId, setupId);
}

if (require.main === module) {
    main();
}
