import { agentConf } from '../../src/agent/agent.conf';
import { AgentRoles, Setup, Template, TemplateStatus, ReceivedTransaction } from '../../src/agent/common/types';
import { initializeTemplates } from '../../src/agent/setup/init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from '../../src/agent/setup/wots-keys';
import { AgentDb } from '../../src/agent/common/agent-db';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';
import { ProtocolProver } from '../../src/agent/protocol-logic/protocol-prover';
import { ProtocolVerifier } from '../../src/agent/protocol-logic/protocol-verifier';
import Client from 'bitcoin-core';
import { ReceivedTemplateRow } from '../../src/agent/listener/listener-utils';

export const payloadUtxo = {
    txid: '0000000000000000000000000000000000000000000000000000000000000000',
    outputIndex: 0,
    amount: agentConf.payloadAmount
};

export const proverUtxo = {
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
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    let verifier = initializeTemplates(
        AgentRoles.VERIFIER,
        setupId,
        BigInt('0x' + agentConf.keyPairs[proverAgentId].schnorrPublic),
        BigInt('0x' + agentConf.keyPairs[verifierAgentId].schnorrPublic),
        payloadUtxo,
        proverUtxo
    );
    prover = mergeWots(AgentRoles.PROVER, prover, verifier);
    setWotsPublicKeysForArgument(setupId, prover);

    verifier = mergeWots(AgentRoles.VERIFIER, verifier, prover);
    setWotsPublicKeysForArgument(setupId, verifier);

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

export interface TestAgent {
    setupId: string;
    role: string;
    agentId: string;
    db: TestAgentDb;
    listener: BitcoinListener;
    templatesRows: ReceivedTemplateRow[];
    pending: ReceivedTemplateRow[];
    setup?: Setup;
    received?: ReceivedTransaction[];
    protocol?: ProtocolProver | ProtocolVerifier;
}

export function setTestAgent(role: AgentRoles): TestAgent {
    const agentId = `bitsnark_${role.toLowerCase()}_1`;
    return {
        setupId: 'test_setup',
        role: role.toLowerCase(),
        agentId: agentId,
        db: new TestAgentDb(agentId),
        listener: new BitcoinListener(agentId),
        templatesRows: [],
        pending: [],
        received: []
    };
}

export class TestAgentDb extends AgentDb {
    listenerDb: AgentDb;
    constructor(agentId: string) {
        super(agentId);
        this.listenerDb = new AgentDb(agentId);
    }

    //Used for testing purposes only
    public async test_restartSetup(setupId: string) {
        //delete all outgoing, incoming and templates
        await this.query(
            `UPDATE templates
            SET status = 'PENDING'
            WHERE setup_id = $1`,
            [setupId]
        );
        await this.query(
            `UPDATE setups
            SET status = 'ACTIVE'
            WHERE id = $1`,
            [setupId]
        );
        await this.query(
            `DELETE FROM received
            WHERE template_id in
            (SELECT template_id
            FROM templates
            WHERE setup_id = $1)`,
            [setupId]
        );
    }

    public async test_markPublished(setupId: string, templateName: string) {
        await this.query(
            `
                UPDATE templates
                SET updated_at = NOW(), status = $1
                WHERE setup_id = $2 AND name = $3
            `,
            [TemplateStatus.PUBLISHED, setupId, templateName]
        );
    }
}

export async function generateBlocks(bitcoinClient: Client, blocksToGenerate: number, address?: string) {
    try {
        // Replace with a valid regtest address
        if (!address) address = (await bitcoinClient.command('getnewaddress')) as string;

        const generatedBlocks = await bitcoinClient.command('generatetoaddress', blocksToGenerate, address as string);
        console.log('Generated Blocks:', generatedBlocks);
    } catch (error) {
        console.error('Error generating blocks:', error);
    }
}
