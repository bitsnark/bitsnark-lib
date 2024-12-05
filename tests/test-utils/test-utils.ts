import { TEST_WOTS_SALT } from '../../src/agent/setup/emulate-setup';
import { agentConf } from '../../src/agent/agent.conf';
import { AgentRoles, Template, TemplateStatus } from '../../src/agent/common/types';
import { initializeTemplates } from '../../src/agent/setup/init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from '../../src/agent/setup/wots-keys';
import { AgentDb } from '../../src/agent/common/agent-db';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';
import { BitcoinNetwork } from '../../src/agent/common/bitcoin-node';
import { ListenerDb } from '@src/agent/listener/listener-db';


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

export interface TestAgent {
    role?: string;
    agentId: string;
    db: testAgentDb;
    listener: BitcoinListener;
    templates: Template[];
    pending: Template[];
}

export function setTestAgent(role: AgentRoles): TestAgent {
    const agentId = `bitsnark_${role.toLowerCase()}_1`;
    return {
        role: role.toLowerCase(),
        agentId: agentId,
        db: new testAgentDb(agentId),
        listener: new BitcoinListener(agentId),
        templates: [],
        pending: []
    };
}

export class testAgentDb extends AgentDb {
    constructor(agentId: string) {
        super(agentId);
    }

    //Used for testing purposes only
    public async test_restartSetup(setupId: string) {
        //delete all outgoing, incoming and templates
        await this.query(
            `UPDATE templates
            SET outgoing_status = 'PENDING'
            WHERE setup_id = $1`, [setupId]);
        await this.query(
            `UPDATE setups
            SET status = 'ACTIVE'
            WHERE id = $1`, [setupId]);
        await this.query(
            `DELETE FROM received
            WHERE template_id in
            (SELECT template_id
            FROM templates
            WHERE setup_id = $1)`, [setupId]);
        ;
    }

    public async test_markPublished(setupId: string, templateName: string) {
        await this.query(
            `
                UPDATE templates
                SET updated_at = NOW(), outgoing_status = $1
                WHERE setup_id = $2 AND name = $3
            `,
            [TemplateStatus.PUBLISHED, setupId, templateName]
        );
    }

    async test_getReadyToSendTemplates(setupId: string): Promise<Template[]> {
        return (
            await this.query<Template>(
                `SELECT ${ListenerDb.templateFields}
            FROM templates
                    JOIN setups ON templates.setup_id = setups.id
                    LEFT JOIN received ON templates.id = received.template_id
            WHERE outgoing_status = 'READY'
            AND setups.id = $1`,
                [setupId]
            )
        ).rows.map(ListenerDb.receivedTemplateReader);
    }
}
