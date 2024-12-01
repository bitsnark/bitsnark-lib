import { v4 as uuidv4 } from 'uuid';
import { agentConf } from '../agent.conf';
import { Bitcoin } from '../../../src/generator/btc_vm/bitcoin';
import { TransactionNames } from '../common/types';
import { encodeWinternitz, getWinternitzPublicKeys, WotsType } from '../common/winternitz';
import { array } from '../common/array-utils';
import { SimpleTapTree } from '../common/taptree';
import { createUniqueDataId } from './wots-keys';
import { AgentDb } from '../common/db';

export async function createSetupId(proverAgentId: string, verifierAgentId: string): Promise<string> {
    const uuid = uuidv4();
    const wotsSalt = Buffer.from(uuid, 'ascii').toString('hex');

    const proverPublicKey = Buffer.from(agentConf.keyPairs[proverAgentId].schnorrPublic, 'hex');
    const verifierPublicKey = Buffer.from(agentConf.keyPairs[verifierAgentId].schnorrPublic, 'hex');

    const scripts: Buffer[] = [];

    // require both signatures
    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;
        bitcoin.verifySignature(proverPublicKey);
        bitcoin.verifySignature(verifierPublicKey);
        const sigScript = bitcoin.programToBinary();
        scripts.push(sigScript);
    }

    // require both signatures, and the winternitz encoded proof
    {
        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;
        bitcoin.verifySignature(proverPublicKey);
        bitcoin.verifySignature(verifierPublicKey);

        const uniques = array(8, (dataIndex) => createUniqueDataId(wotsSalt, TransactionNames.PROOF, 0, 1, dataIndex));
        const keys = array(8, (dataIndex) => getWinternitzPublicKeys(WotsType._256, uniques[dataIndex]));
        const witnessSIs = keys
            .map((_, dataIndex) => encodeWinternitz(WotsType._256, 0n, uniques[dataIndex]))
            .map((ba) => ba.map((b) => bitcoin.addWitness(b)));
        for (let i = 0; i < keys.length; i++) {
            bitcoin.winternitzCheck256(witnessSIs[i], keys[i]);
        }
        const proofScript = bitcoin.programToBinary();
        scripts.push(proofScript);
    }

    const stt = new SimpleTapTree(agentConf.internalPubkey, scripts);
    const setupId = stt.getScriptPubkey().toString('hex');

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
