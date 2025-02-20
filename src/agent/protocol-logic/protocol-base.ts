import { RawTransaction } from 'bitcoin-core';
import { BitcoinNode } from '../common/bitcoin-node';
import { parseInput, parseInputs } from './parser';
import {
    AgentRoles,
    Setup,
    SpendingCondition,
    Template,
    TemplateStatus,
    ReceivedTransaction,
    TemplateNames,
    WitnessAndValue
} from '../common/types';
import { getTemplateByTemplateId } from '../common/templates';
import { AgentDb } from '../common/agent-db';
import { WOTS_NIBBLES, WotsType } from '../common/winternitz';
import { sleep } from '../common/sleep';

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

    async getTemplateStatus(templateName: TemplateNames): Promise<TemplateStatus> {
        return (await this.db.getTemplate(this.setupId, templateName)).status!;
    }

    async waitForTransmission(templateName: TemplateNames): Promise<TemplateStatus> {
        let lastStatus = '';
        while (true) {
            const t = await this.getTemplateStatus(templateName);
            if (t != lastStatus) {
                console.log(`Template ${templateName}, status: ${t}`);
                lastStatus = t;
            }
            if (t == TemplateStatus.PUBLISHED || t == TemplateStatus.REJECTED) {
                return t;
            }
            await sleep(1000);
        }
    }

    async sendTransaction(name: TemplateNames, data?: Buffer[][]) {
        const template = await this.db.getTemplate(this.setupId, name);
        if (template.status == TemplateStatus.REJECTED) throw new Error(`Template ${name} was rejected`);
        if (template.status == TemplateStatus.READY) return;
        if (template.status == TemplateStatus.PUBLISHED) {
            // Please keep this log message as long as we manually mine blocks in `npm run e2e`.
            console.log(`Template ${name} published`);
            return;
        }

        // for (let i = 0; i < template.inputs.length; i++) {
        //     const bitcoin = new Bitcoin();
        //     bitcoin.throwOnFail = true;
        //     const input = template.inputs[i];
        //     if (!input.script) continue;
        //     if (data && data[i]) data[i].forEach((b) => bitcoin.addWitness(b));
        //     const sc = getSpendingConditionByInput(this.templates!, input);
        //     if (sc.script!.compare(input.script!) != 0) throw new Error('Different scripts!');
        //     for (let i = 0; sc.signaturesPublicKeys && i < sc.signaturesPublicKeys.length; i++)
        //         bitcoin.addWitness(Buffer.alloc(64));
        //     console.log(`Checking script for ${template.name}/${i}...`);
        //     executeProgram(bitcoin, input.script!);
        // }

        const bufferOrNumberData = data ? data.map(d => d.map(b => b.length == 1 ? b[0] : b)) : undefined;

        await this.db.markTemplateToSend(this.setupId, name, bufferOrNumberData);
        console.log(`Asking to send template ${name} (make sure sender is listening: npm run bitcoin-sender)`);
        const status = await this.waitForTransmission(name);
        if (status == TemplateStatus.REJECTED) {
            console.error(`Template ${name} was rejected!`);
        }
    }

    parseProof(incoming: Incoming): bigint[] {
        const rawTx = incoming.received.raw as RawTransaction;
        const proof = parseInput(
            this.templates!,
            incoming.template.inputs[0],
            rawTx.vin[0].txinwitness!.map((s: string) => Buffer.from(s, 'hex'))
        ).map((wav) => wav.value);
        return proof;
    }

    parseSelection(incoming: Incoming, selectionPathUnparsed: Buffer[][]): number {
        const rawTx = incoming.received.raw as RawTransaction;
        const usableWitness = rawTx.vin[0].txinwitness!.slice(0, WOTS_NIBBLES[WotsType._24]);
        const data = parseInput(
            this.templates!,
            incoming.template.inputs[0],
            usableWitness.map((s) => Buffer.from(s, 'hex'))
        );
        selectionPathUnparsed.push(usableWitness.map((s) => Buffer.from(s, 'hex')));
        return Number(data[0].value);
    }

    async getCurrentBlockHeight(): Promise<number> {
        return await this.bitcoinClient.getBlockCount();
    }

    parseState(incoming: Incoming): WitnessAndValue[] {
        const rawTx = incoming.received.raw;
        const state = parseInputs(
            this.templates!,
            incoming.template.inputs,
            rawTx.vin.map((vin) => vin.txinwitness!.map((s) => Buffer.from(s, 'hex')))
        );
        return state.flat();
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
