import { agentConf } from '../../src/agent/agent.conf';
import { AgentRoles, Template, TemplateStatus } from '../../src/agent/common/types';
import { initializeTemplates } from '../../src/agent/setup/init-templates';
import { mergeWots, setWotsPublicKeysForArgument } from '../../src/agent/setup/wots-keys';
import { AgentDb, rowToObj, templateFields } from '../../src/agent/common/agent-db';
import { BitcoinListener } from '../../src/agent/listener/bitcoin-listener';
import { ListenerDb, ReceivedTemplate } from '../../src/agent/listener/listener-db';

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
    setupId?: string;
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
        setupId: 'test_setup',
        role: role.toLowerCase(),
        agentId: agentId,
        db: new testAgentDb(agentId),
        listener: new BitcoinListener(agentId),
        templates: [],
        pending: []
    };
}

export interface test_Template extends Template {
    data: string[][];
}

export class testAgentDb extends AgentDb {
    listenerDb: ListenerDb;
    constructor(agentId: string) {
        super(agentId);
        this.listenerDb = new ListenerDb(agentId);
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

    async test_getReadyToSendTemplates(setupId: string): Promise<ReceivedTemplate[]> {
        return (
            await this.query<test_Template>(
                `SELECT ${ListenerDb.templateFields}
            FROM templates
                    JOIN setups ON templates.setup_id = setups.id
                    LEFT JOIN received ON templates.id = received.template_id
            WHERE templates.status = 'READY'
            AND setups.id = $1`,
                [setupId]
            )
        ).rows.map(ListenerDb.receivedTemplateReader);
    }

    public async test_getTemplates(setupId: string): Promise<test_Template[]> {
        const testTemplateFields = templateFields.concat(['protocol_data']);
        const rows = (
            await this.query<test_Template>(
                `SELECT  ${testTemplateFields.join(', ')}
                    FROM templates WHERE setup_id = $1
                    ORDER BY ordinal ASC`,
                [setupId]
            )
        ).rows;
        if (rows.length == 0) throw new Error(`No templates found, setupId: ${setupId}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newRows = rows.map((row) => rowToObj(testTemplateFields, row as any, ['protocol_data']));
        return newRows as test_Template[];
    }
}
