import { agentConf } from '../agent.conf';
import { AgentRoles, SignatureType, TemplateNames } from '../common/types';
import { SimpleTapTree } from '../common/taptree';
import { generateWotsPublicKeysForSpendingCondition } from './wots-keys';
import { AgentDb } from '../common/agent-db';
import { generateBoilerplate } from './generate-scripts';
import { protocolStart } from '../common/templates';
import { randomBytes } from 'crypto';

export async function createSetupId(proverAgentId: string, verifierAgentId: string): Promise<string> {
    const wotsSalt = randomBytes(32).toString('hex');

    const proverPublicKey = Buffer.from(agentConf.keyPairs[proverAgentId].schnorrPublic, 'hex');
    const verifierPublicKey = Buffer.from(agentConf.keyPairs[verifierAgentId].schnorrPublic, 'hex');

    const lockedFunds = protocolStart.find(t => t.name == TemplateNames.LOCKED_FUNDS);
    if (!lockedFunds) throw new Error('Locked funds template not found');

    const script = (scIndex: number) => {
        const sc = lockedFunds.outputs[0].spendingConditions[scIndex];
        sc.signaturesPublicKeys = {
            [SignatureType.NONE]: [],
            [SignatureType.BOTH]: [proverPublicKey, verifierPublicKey],
            [SignatureType.PROVER]: [proverPublicKey],
            [SignatureType.VERIFIER]: [verifierPublicKey]
        }[sc.signatureType];
        generateWotsPublicKeysForSpendingCondition(
            wotsSalt, TemplateNames.PROOF, sc, 0, scIndex);
        return generateBoilerplate(AgentRoles.PROVER,
            sc, {
            templateName: TemplateNames.LOCKED_FUNDS,
            outputIndex: 0,
            spendingConditionIndex: scIndex
        });
    };

    const scripts = lockedFunds.outputs[0].spendingConditions.map((_, i) => script(i));
    const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
    const setupId = stt.getTaprootAddress();

    const db = new AgentDb(proverAgentId);
    await db.createSetup(setupId, wotsSalt);

    return setupId;
}

async function main() {
    const setupId = await createSetupId('bitsnark_prover_1', 'bitsnark_verifier_1');
    console.log('setupId: ', setupId);
}

if (require.main === module) {
    main();
}
