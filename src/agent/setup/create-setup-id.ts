import { v4 as uuidv4 } from 'uuid';
import { agentConf } from '../agent.conf';
import { Bitcoin } from '../../../src/generator/btc_vm/bitcoin';
import { AgentRoles, SignatureType, TemplateNames } from '../common/types';
import { encodeWinternitz, getWinternitzPublicKeys, WotsType } from '../common/winternitz';
import { array } from '../common/array-utils';
import { SimpleTapTree } from '../common/taptree';
import { createUniqueDataId } from './wots-keys';
import { AgentDb } from '../common/agent-db';
import { initializeTemplates } from './init-templates';
import { generateBoilerplate } from './generate-scripts';
import { protocolStart } from '../common/templates';

export async function createSetupId(proverAgentId: string, verifierAgentId: string): Promise<string> {
    const uuid = uuidv4();
    const wotsSalt = Buffer.from(uuid, 'ascii').toString('hex');

    const proverPublicKey = Buffer.from(agentConf.keyPairs[proverAgentId].schnorrPublic, 'hex');
    const verifierPublicKey = Buffer.from(agentConf.keyPairs[verifierAgentId].schnorrPublic, 'hex');

    const lockedFunds = protocolStart.find(t => t.name == TemplateNames.LOCKED_FUNDS);
    if (!lockedFunds) throw new Error('Locked funds template not found');

    const script = (scIndex: number) => generateBoilerplate(AgentRoles.PROVER, 
        lockedFunds?.outputs[0].spendingConditions[scIndex]!, {
        templateName: TemplateNames.LOCKED_FUNDS,
        outputIndex: 0,
        spendingConditionIndex: scIndex
    });

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
