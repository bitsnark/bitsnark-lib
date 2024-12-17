import { AgentDb } from '../common/agent-db';
import { ReceivedTransaction, SetupStatus, Template } from '../common/types';

export interface ReceivedTemplateRow extends Template, Partial<ReceivedTransaction> {
    lastCheckedBlockHeight?: number;
    setupStatus?: SetupStatus;
}

export async function getReceivedTemplates(db: AgentDb): Promise<ReceivedTemplateRow[]> {
    const listenerTemplates: ReceivedTemplateRow[] = [];

    const activeSetups = await db.getActiveSetups();
    for (const setup of activeSetups) {
        let templates: Template[] | undefined;
        try {
            templates = await db.getTemplates(setup.id);
            let received: ReceivedTransaction[] = [];
            try {
                received = await db.getReceivedTransactions(setup.id);
            } catch (error) {
                //
            }

            for (const template of templates) {
                const receivedTemplate = received.find((rt: ReceivedTransaction) => rt.templateId === template.id);
                listenerTemplates.push({
                    lastCheckedBlockHeight: setup.lastCheckedBlockHeight,
                    setupStatus: setup.status,
                    ...template,
                    ...receivedTemplate
                });
            }
        } catch (error) {
            if (templates) continue;
        }
    }
    return listenerTemplates;
}
