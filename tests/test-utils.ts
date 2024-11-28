import { agentConf } from '../src/agent/agent.conf';
import { AgentRoles } from '../src/agent/common/types';
import { initializeTemplates } from '../src/agent/setup/init-templates';
import { Transaction } from '../src/agent/common/transactions';
import { generateWotsPublicKeys, mergeWots, setWotsPublicKeysForArgument } from '../src/agent/setup/wots-keys';

const payloadUtxo = {
    txId: '0000000000000000000000000000000000000000000000000000000000000000',
    outputIndex: 0,
    amount: agentConf.payloadAmount,
    external: true
};

const proverUtxo = {
    txId: '1111111111111111111111111111111111111111111111111111111111111111',
    outputIndex: 0,
    amount: agentConf.proverStakeAmount,
    external: true
};

export const proverAgentId = 'bitsnark_prover_1';
export const verifierAgentId = 'bitsnark_verifier_1';
export const setupId = 'test_setup';

export function initTemplatesForTest(): { prover: Transaction[]; verifier: Transaction[] } {
    let prover = initializeTemplates(
        proverAgentId,
        AgentRoles.PROVER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    generateWotsPublicKeys(setupId, prover, AgentRoles.VERIFIER);
    let verifier = initializeTemplates(
        verifierAgentId,
        AgentRoles.VERIFIER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    generateWotsPublicKeys(setupId, verifier, AgentRoles.VERIFIER);
    prover = mergeWots(AgentRoles.PROVER, prover, verifier);
    verifier = mergeWots(AgentRoles.VERIFIER, verifier, prover);
    setWotsPublicKeysForArgument(prover);
    setWotsPublicKeysForArgument(verifier);
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
