import { RawTransaction } from 'bitcoin-core';
import { BitcoinNode } from '../common/bitcoin-node';
import { parseInput } from './parser';
import { AgentRoles, Setup, SpendingCondition, Template, TemplateStatus, ReceivedTransaction } from '../common/types';
import { getTemplateByTemplateId } from '../common/templates';
import { AgentDb } from '../common/agent-db';
import { sleep } from '../common/sleep';
import { bigintToBufferBE } from '../common/encoding';

export interface Incoming {
    received: ReceivedTransaction;
    template: Template;
}

export class ProtocolBase {
    agentId: string;
    setupId: string;
    role: AgentRoles;
    bitcoinClient: BitcoinNode;
    templates?: Template[];
    setup?: Setup;
    db: AgentDb;

    constructor(agentId: string, setupId: string, role: AgentRoles) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.role = role;
        this.bitcoinClient = new BitcoinNode();
        this.db = new AgentDb(this.agentId);
    }

    async setTemplates() {
        if (!this.templates || !this.templates.length) {
            this.templates = await this.db.getTemplates(this.setupId);
        }
        if (!this.setup) {
            this.setup = await this.db.getSetup(this.setupId);
        }
    }

    async getIncoming(): Promise<Incoming[]> {
        const incomingArray = await this.db.getReceivedTransactions(this.setupId);
        const pairs: Incoming[] = [];
        for (const rt of incomingArray) {
            const template = getTemplateByTemplateId(this.templates!, rt.templateId);
            pairs.push({ received: rt, template });
        }
        return pairs;
    }

    async sendTransaction(name: string, data?: Buffer[][]) {
        await this.db.markTemplateToSend(this.setupId, name, data);
        console.log(
            'Waiting for template to be broadcasted (make sure broadcaster is listening: npm run start-bitcoin-sender)'
        );
        let template;
        do {
            template = await this.db.getTemplate(this.setupId, name);
            if (template.status == TemplateStatus.PUBLISHED) break;
            if (template.status == TemplateStatus.REJECTED) throw new Error('Template rejected');
        } while (!(await sleep(1000)));
    }

    parseProof(incoming: Incoming): bigint[] {
        const rawTx = incoming.received.raw as RawTransaction;
        const proof = parseInput(
            this.templates!,
            incoming.template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s: string) => Buffer.from(s, 'hex'))
        );
        return proof;
    }

    parseSelection(incoming: Incoming): number {
        const rawTx = incoming.received.raw as RawTransaction;
        const data = parseInput(
            this.templates!,
            incoming.template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return Number(data[0]);
    }

    async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    parseState(incoming: Incoming): Buffer[] {
        const rawTx = incoming.received.raw;
        const state = parseInput(
            this.templates!,
            incoming.template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s) => Buffer.from(s, 'hex'))
        );
        return state.map((n) => bigintToBufferBE(n, 256));
    }

    async checkTimeout(incoming: Incoming): Promise<SpendingCondition | null> {
        // check if any spending condition has a timeout that already expired
        const currentBlockHeight = await this.getCurrentBlockHeight();
        for (const output of incoming.template.outputs) {
            for (const sc of output.spendingConditions) {
                if (sc.nextRole != this.role) continue;
                if (sc.timeoutBlocks && incoming.received.height! + sc.timeoutBlocks <= currentBlockHeight) {
                    // found one, send the relevant tx
                    return sc;
                }
            }
        }
        return null;
    }
}
