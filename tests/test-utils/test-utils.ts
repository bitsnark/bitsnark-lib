import { TEST_WOTS_SALT } from '../../src/agent/setup/emulate-setup';
import { agentConf } from '../../src/agent/agent.conf';
import { AgentRoles, Template } from '../../src/agent/common/types';
import { initializeTemplates } from '../../src/agent/setup/init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from '../../src/agent/setup/wots-keys';

const payloadUtxo = {
    txid: '0000000000000000000000000000000000000000000000000000000000000000',
    outputIndex: 0,
    amount: agentConf.payloadAmount
};

const proverUtxo = {
    txid: '1111111111111111111111111111111111111111111111111111111111111111',
    outputIndex: 0,
    amount: agentConf.proverStakeAmount
};

export const proverAgentId = 'bitsnark_prover_1';
export const verifierAgentId = 'bitsnark_verifier_1';
export const setupId = 'test_setup';

export function initTemplatesForTest(): { prover: Template[]; verifier: Template[] } {
    let prover = initializeTemplates(
        AgentRoles.PROVER,
        setupId,
        TEST_WOTS_SALT,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    let verifier = initializeTemplates(
        AgentRoles.VERIFIER,
        setupId,
        TEST_WOTS_SALT,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    prover = mergeWots(AgentRoles.PROVER, prover, verifier);
    verifier = mergeWots(AgentRoles.VERIFIER, verifier, prover);
    setWotsPublicKeysForArgument(TEST_WOTS_SALT, prover);
    setWotsPublicKeysForArgument(TEST_WOTS_SALT, verifier);
    return { prover, verifier };
}

// recursivation!
type Bufferheap = Buffer | Bufferheap[];
export function deepCompare(a: Bufferheap, b: Bufferheap): boolean {
    if (a instanceof Buffer && b instanceof Buffer) return a.compare(b) == 0;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length != b.length) return false;
        return a.every((ta, i) => deepCompare(ta, b[i]));
    }
    return false;
}
