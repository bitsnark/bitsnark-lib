import { Setup, Template, TemplateStatus } from '../../src/agent/common/types';
import {
    AgentDb,
    ReceivedTransaction,
    updateSetupPartial,
    UpdateTemplatePartial
} from '../../src/agent/common/agent-db';
import { test_Template, TestAgentDb } from './test-utils';

async function waitAndReturn<T>(obj: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(obj), 1));
}

export class AgentDbMock extends TestAgentDb {
    /*** SETUP ***/

    public createSetupReturn?: Setup;
    public createSetupCalledCount = 0;
    public createSetupCalledParams?: { setupId: string };
    public async createSetup(setupId: string): Promise<Setup> {
        this.createSetupCalledParams = { setupId };
        this.createSetupCalledCount++;
        return waitAndReturn<Setup>(this.createSetupReturn!);
    }

    public updateSetupCalledCount = 0;
    public updateSetupCalledParams?: { setupId: string; setup: updateSetupPartial };
    public async updateSetup(setupId: string, setup: updateSetupPartial) {
        this.updateSetupCalledParams = { setupId, setup };
        this.updateSetupCalledCount++;
        return this.getSetup(setupId);
    }

    public getSetupReturn?: Setup;
    public getSetupCalledCount = 0;
    public getSetupCalledParams?: { setupId: string };
    public async getSetup(setupId: string): Promise<Setup> {
        console.log('MOCK SETUP CALLED');
        this.getSetupCalledParams = { setupId };
        this.getSetupCalledCount++;
        return waitAndReturn(this.getSetupReturn!);
    }

    public markSetupPegoutActiveCalledCount = 0;
    public markSetupPegoutActiveCalledParams?: { setupId: string };
    public async markSetupPegoutActive(setupId: string) {
        this.markSetupPegoutActiveCalledParams = { setupId };
        this.markSetupPegoutActiveCalledCount++;
    }

    public markSetupPegoutSuccessfulCalledCount = 0;
    public markSetupPegoutSuccessfulCalledParams?: { setupId: string };
    public async markSetupPegoutSuccessful(setupId: string) {
        this.markSetupPegoutSuccessfulCalledParams = { setupId };
        this.markSetupPegoutSuccessfulCalledCount++;
    }

    public markSetupPegoutFailedCalledCount = 0;
    public markSetupPegoutFailedCalledParams?: { setupId: string };
    public async markSetupPegoutFailed(setupId: string) {
        this.markSetupPegoutFailedCalledParams = { setupId };
        this.markSetupPegoutFailedCalledCount++;
    }

    public updateSetupLastCheckedBlockHeightCalledCount = 0;
    public updateSetupLastCheckedBlockHeightCalledParams?: { setupId: string; blockHeight: number };
    public async updateSetupLastCheckedBlockHeight(setupId: string, blockHeight: number) {
        this.updateSetupLastCheckedBlockHeightCalledParams = { setupId, blockHeight };
        this.updateSetupLastCheckedBlockHeightCalledCount++;
    }

    public updateSetupLastCheckedBlockHeightBatchCalledCount = 0;
    public updateSetupLastCheckedBlockHeightBatchCalledParams?: { setupIds: string[]; blockHeight: number };
    public async updateSetupLastCheckedBlockHeightBatch(setupIds: string[], blockHeight: number) {
        this.updateSetupLastCheckedBlockHeightBatchCalledParams = { setupIds, blockHeight };
        this.updateSetupLastCheckedBlockHeightBatchCalledCount++;
    }

    public getActiveSetupsReturn?: Setup[];
    public getActiveSetupsCalledCount = 0;
    public async getActiveSetups(): Promise<Setup[]> {
        this.getActiveSetupsCalledCount++;
        return waitAndReturn(this.getActiveSetupsReturn!);
    }

    /*** Templates ***/

    public getTemplatesReturn?: Template[];
    public getTemplatesCalledCount = 0;
    public getTemplatesCalledParams?: { setupId: string };
    public async getTemplates(setupId: string): Promise<Template[]> {
        console.log('MOCK getTemplates CALLED');
        this.getTemplatesCalledCount++;
        this.getTemplatesCalledParams = { setupId };
        return waitAndReturn(this.getTemplatesReturn!);
    }

    public insertTemplatesCalledCount = 0;
    public insertTemplatesCalledParams?: { setupId: string; templates: Template[] };
    public async insertTemplates(setupId: string, templates: Template[]) {
        this.insertTemplatesCalledCount++;
        this.insertTemplatesCalledParams = { setupId, templates };
    }

    public updateTemplatesCalledCount = 0;
    public updateTemplatesCalledParams?: { setupId: string; templates: UpdateTemplatePartial[] };
    public async updateTemplates(setupId: string, templates: UpdateTemplatePartial[]) {
        this.updateTemplatesCalledCount++;
        this.updateTemplatesCalledParams = { setupId, templates };
    }

    public upsertTemplatesCalledCount = 0;
    public upsertTemplatesCalledParams?: { setupId: string; templates: Template[] };
    public async upsertTemplates(setupId: string, templates: Template[]) {
        this.upsertTemplatesCalledCount++;
        this.upsertTemplatesCalledParams = { setupId, templates };
    }

    public markTemplateToSendCalledCount = 0;
    public markTemplateToSendCalledParams?: { setupId: string; templateName: string; data?: Buffer[][] };
    public async markTemplateToSend(setupId: string, templateName: string, data?: Buffer[][]) {
        this.markTemplateToSendCalledCount++;
        this.markTemplateToSendCalledParams = { setupId, templateName, data };
        const templateId = this.gettestTemplatesReturn!.find((t: test_Template) => t.name === templateName)?.id;
        this.gettestTemplatesReturn!.find((t: test_Template) => t.name === templateName)!.data = data ?? [];
        this.gettestTemplatesReturn!.find((t: test_Template) => t.name === templateName)!.status = TemplateStatus.READY
    }



    // Received Transactions

    public getReceivedTransactionsReturn?: ReceivedTransaction[];
    public getReceivedTransactionsCalledCount = 0;
    public getReceivedTransactionsCalledParams?: { setupId: string };
    public async getReceivedTransactions(setupId: string): Promise<ReceivedTransaction[]> {
        console.log('MOCK getReceivedTransaction CALLED');
        this.getReceivedTransactionsCalledCount++;
        this.getReceivedTransactionsCalledParams = { setupId };
        return waitAndReturn(this.getReceivedTransactionsReturn!);
    }

    //**** SET DATA */
    public setSetup(setup: Setup) {
        this.getSetupReturn = setup;
    }

    public setTemplates(templates: Template[]) {
        this.getTemplatesReturn = templates;
    }

    public setReceivedTransaction(received: ReceivedTransaction[]) {
        this.getReceivedTransactionsReturn = received;
    }



    // public test_getReadyToSendTemplates(setupId: string): Promise<ReceivedTransaction[]> {
    //     return waitAndReturn(this.gettestTemplatesReturn!.filter((template) => template.status === TemplateStatus.READY));
    // }

    public gettestTemplatesReturn?: test_Template[];
    public test_getTemplates(): Promise<test_Template[]> {
        return waitAndReturn(this.gettestTemplatesReturn ?? []);
    }

}
