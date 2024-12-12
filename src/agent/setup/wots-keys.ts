import { getSpendingConditionByInput, getTemplateByName, twoDigits } from '../common/templates';
import { AgentRoles, SpendingCondition, Template, TemplateNames, iterations } from '../common/types';
import {
    encodeWinternitz,
    encodeWinternitz24,
    getWinternitzPublicKeys,
    getWinternitzPublicKeysDebug,
    WotsType
} from '../common/winternitz';
import { TemplateWithWotsKeys } from './messages';

export function createUniqueDataId(
    setupId: string,
    templateName: string,
    outputIndex: number,
    scIndex: number,
    dataIndex: number
) {
    const u = `${setupId}/${templateName}/${outputIndex}/${scIndex}/${dataIndex}`;
    return u;
}

export function setWotsPublicKeysForArgument(setupId: string, templates: Template[]) {
    const template = getTemplateByName(templates, TemplateNames.ARGUMENT);
    // there should be 5 inputs
    if (template.inputs.length != 5) throw new Error('Wrong number of inputs');
    // 0 is the index
    const input = template.inputs[0];
    const sc = getSpendingConditionByInput(templates, input);
    // there should be 7 wots keys
    if (sc.wotsSpec?.length != 7 || !sc.wotsSpec.every((spec) => spec == WotsType._24))
        throw new Error('Unexpected spec');

    const actualWotsKeys: Buffer[][] = [];

    // the first 6 should be the same keys as the selections, in order
    for (let i = 0; i < iterations; i++) {
        const selection = getTemplateByName(templates, TemplateNames.SELECT + '_' + twoDigits(i));
        if (selection.inputs.length != 1) throw new Error('Wrong number of inputs');
        const sc = getSpendingConditionByInput(templates, selection.inputs[0]);
        if (sc.wotsPublicKeys!.length != 1) throw new Error('Wrong number of keys');
        actualWotsKeys.push(sc.wotsPublicKeys![0]);
    }

    // the seventh is the existing one
    actualWotsKeys.push(sc.wotsPublicKeys![6]);
    sc.wotsPublicKeys = actualWotsKeys;
    input.wotsPublicKeys = sc.wotsPublicKeys;

    const argumentSelectionPath = [1n, 2n, 3n, 4n, 5n, 6n];
    sc.exampleWitness = argumentSelectionPath.map((n, i) =>
        encodeWinternitz24(n, createUniqueDataId(setupId, TemplateNames.SELECT + '_' + twoDigits(i), 0, 0, 0))
    );
    sc.exampleWitness[6] = encodeWinternitz24(123456n, createUniqueDataId(setupId, TemplateNames.ARGUMENT, 0, 0, 6));
    return templates;
}

export function generateWotsPublicKeysForSpendingCondition(
    setupId: string,
    templateName: string,
    sc: SpendingCondition,
    outputIndex: number,
    spendingConditionIndex: number
) {
    if (!sc.wotsSpec) return;

    sc.wotsPublicKeys = sc.wotsSpec.map((wt, dataIndex) =>
        getWinternitzPublicKeys(
            wt,
            createUniqueDataId(setupId, templateName, outputIndex, spendingConditionIndex, dataIndex)
        )
    );
    sc.wotsSpec!.map((wt, dataIndex) =>
        getWinternitzPublicKeys(
            wt,
            createUniqueDataId(setupId, templateName, outputIndex, spendingConditionIndex, dataIndex)
        )
    );
    sc.wotsPublicKeysDebug = sc.wotsSpec!.map((wt, dataIndex) =>
        getWinternitzPublicKeysDebug(
            wt,
            createUniqueDataId(setupId, templateName, outputIndex, spendingConditionIndex, dataIndex)
        )
    );

    sc.exampleWitness = sc.wotsSpec!.map((spec, dataIndex) => {
        return encodeWinternitz(
            spec,
            0n,
            createUniqueDataId(setupId!, templateName, outputIndex, spendingConditionIndex, dataIndex)
        );
    });
}

export function generateWotsPublicKeys(setupId: string, templates: Template[], role: AgentRoles) {
    for (const template of templates) {
        for (const input of template.inputs) {
            const sc = getSpendingConditionByInput(templates, input);
            if (sc.wotsSpec && sc.nextRole == role) {
                generateWotsPublicKeysForSpendingCondition(
                    setupId,
                    template.name,
                    sc,
                    input.outputIndex,
                    input.spendingConditionIndex
                );
                input.wotsPublicKeys = sc.wotsPublicKeys;
            }
        }
    }
    return templates;
}

export function mergeWots(role: AgentRoles, mine: Template[], theirs: TemplateWithWotsKeys[]): Template[] {
    const wotsNotNull = (t: Buffer[][] | undefined) => {
        if (!t) throw new Error('Null error');
        return t;
    };

    return mine.map((template, transactionIndex) => ({
        ...template,
        outputs: template.outputs.map((output, outputIndex) => ({
            ...output,
            spendingConditions: output.spendingConditions.map((sc, scIndex) => ({
                ...sc,
                wotsPublicKeys: !sc.wotsSpec
                    ? undefined
                    : sc.nextRole == role
                      ? wotsNotNull(sc.wotsPublicKeys)
                      : wotsNotNull(
                            theirs[transactionIndex].outputs[outputIndex].spendingConditions[scIndex].wotsPublicKeys
                        )
            }))
        }))
    }));
}
