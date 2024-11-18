import { BitcoinNode } from "./bitcoin-node";
import { AgentRoles } from "./common";
import { readTemplates } from "./db";
import { Transaction } from "./transactions-new";



export interface TemplateIds {
    templateId: number;
    txId: string;
}

interface IncomingTx {
    templateId: number;
    txId: string;
    blockHeight: number;
}

export interface TransmittedTx extends IncomingTx {
    name: string;
    setupId: string;
}


export class SetupTemplate {
    private agentId: string;
    private agentRole: AgentRoles;
    private setupId: string;
    public protocolVersion: number;
    private templates: Map<string, TemplateIds> = new Map();
    private incoming: Map<string, IncomingTx> = new Map();
    private lastBlockHeight: number
    public client = new BitcoinNode()


    constructor(agentId: string, agentRole: AgentRoles, setupId: string, protocolVersion: number, lastBlockHeight: number) {
        this.agentId = agentId;
        this.agentRole = agentRole;
        this.setupId = setupId;
        this.protocolVersion = protocolVersion;
        this.lastBlockHeight = lastBlockHeight;
    }

    async start(setupTemplates: Transaction[] = [], incomingTransactions: TransmittedTx[] = []): Promise<void> {
        await this.setTemplates(setupTemplates);
        await this.setIncoming(incomingTransactions);
    }

    private async setTemplates(setupTemplates: Transaction[] = []): Promise<void> {
        const useTemplates = setupTemplates.length === 0 ?
            setupTemplates = await readTemplates(this.agentId, this.setupId) : setupTemplates;

        for (const templateRow of useTemplates) {
            this.templates.set(
                templateRow.transactionName,
                { templateId: templateRow.templateId ?? 0, txId: templateRow.txId ?? '' }
            );
        }
    }

    updateTemplateTxId(name: string, txId: string): void {
        const templateId = this.templates.get(name)!.templateId;
        this.templates.set(name, { templateId, txId });
    }

    private async setIncoming(incomingTransactions: TransmittedTx[] = []): Promise<void> {
        for (const incomingRow of incomingTransactions) {
            this.incoming.set(
                incomingRow.name,
                {
                    templateId: incomingRow.templateId,
                    txId: incomingRow.txId,
                    blockHeight: incomingRow.blockHeight
                }
            );
        }
    }

    async insertIncoming(incomingTransactions: TransmittedTx): Promise<void> {
        this.incoming.set(
            incomingTransactions.name,
            {
                templateId: incomingTransactions.templateId,
                txId: incomingTransactions.txId,
                blockHeight: incomingTransactions.blockHeight
            }
        );

    }


    getIncomingArry(): TransmittedTx[] {
        return Array.from(this.incoming.entries()).map(([name, incoming]) => {
            return {
                name: name,
                templateId: incoming.templateId,
                txId: incoming.txId,
                blockHeight: incoming.blockHeight,
                setupId: this.setupId
            };
        });
    }

    getSetupMap(): Map<string, TemplateIds> {
        return this.templates;
    }


}
