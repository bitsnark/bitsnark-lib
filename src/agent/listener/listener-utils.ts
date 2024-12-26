import { AgentDb } from '../common/agent-db';
import { ReceivedTransaction, SetupStatus, Template } from '../common/types';

export interface JoinedTemplate extends Template, Partial<ReceivedTransaction> {
    lastCheckedBlockHeight?: number;
    setupStatus?: SetupStatus;
}

export async function getTemplatesRows(db: AgentDb): Promise<JoinedTemplate[]> {
    const listenerTemplates: JoinedTemplate[] = [];

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
                const receivedTemplate = received.filter((rt: ReceivedTransaction) => rt.templateId === template.id);
                listenerTemplates.push({
                    lastCheckedBlockHeight: setup.lastCheckedBlockHeight,
                    setupStatus: setup.status,
                    ...template,
                    ...receivedTemplate[0]
                });
            }
        } catch (error) {
            if (templates) continue;
        }
    }
    return listenerTemplates;
}
