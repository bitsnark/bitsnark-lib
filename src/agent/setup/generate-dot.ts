import minimist from 'minimist';
import { Template, Input, TemplateNames, AgentRoles } from '../common/types';
import { twoDigits } from '../common/templates';
import { AgentDb } from '../common/agent-db';
const TRANSACTION_SHAPE = 'box';
const INCOMING_FUNDS_SHAPE = 'oval';
const PYABLE_SHAPE = 'note';
const DISSECTION_SHAPE = 'tripleoctagon';
const CONNECTOR_SHAPE = 'point';
const CONNECTOR_ARROWHEAD = 'none';

const PROVER_COLOR = 'green';
const VERIFIER_COLOR = 'blue';
const LOCKED_FUNDS_COLOR = 'magenta';
const DISSECTION_COLOR = 'black';
const SYMBOLIC_OUTPUT_COLOR = 'gray';

const TIMEOUT_STYLE = 'dashed';

const LOCKED_FUNDS_OUTPUT_WEIGHT = 20;
const FIRST_SELECT_UNCONTESTED_WEIGHT = 100;
const VERTICAL_ALIGNMENT_WEIGHTS: { [key: string]: number } = {
    mainSteps: 30,
    stateUncontested: 1,
    selectUncontested: 0
};

const DISSECTION_NAME = 'Dissection';

function dot(templates: Template[], collapseDissection = false): string {
    // Sort by template ordinal and name for readability and consistency.
    templates = templates.sort(
        (a, b) => (a.ordinal && b.ordinal && a.ordinal - b.ordinal) || a.name.localeCompare(b.name)
    );

    // Optionally collapse contention dissection section templates.
    if (collapseDissection)
        templates = templates.reduce((filteredTemplates: Template[], template) => {
            const match = template.name.match(
                new RegExp(`^(${TemplateNames.STATE}|${TemplateNames.SELECT})(_[^0-9]*)([0-9]+)$`)
            );
            if (match) {
                const ordinal = parseInt(match[3], 10);

                // Remove all but the first state and state_uncontested templates.
                if (template.name.startsWith(TemplateNames.STATE) && ordinal > 0) return filteredTemplates;

                if (template.name.startsWith(TemplateNames.SELECT)) {
                    // Patch the first select template to represent the collapsed templates.
                    if (template.name === `${TemplateNames.SELECT}_00`) {
                        template.name = DISSECTION_NAME;
                        // Remove all remaining select and select_uncontested templates except the last of each.
                    } else if (
                        templates.find(
                            (template) => template.name === `${match[1]}${match[2]}${twoDigits(ordinal + 1)}`
                        )
                    )
                        return filteredTemplates;

                    // Patch the last select template to connect to the fake dissection template.
                    if (template.name === `${TemplateNames.SELECT}_${twoDigits(ordinal)}`) {
                        template.inputs = template.inputs.map((input) => ({
                            ...input,
                            templateName: DISSECTION_NAME
                        }));
                    }
                }
            }

            return [...filteredTemplates, template];
        }, []);

    // Index template outputs to the template inputs that can spend them.
    const incomingOutputs: { [key: string]: [Template, Input][][] } = templates.reduce(
        (incomingOutputs: { [key: string]: [Template, Input][][] }, template) => {
            template.inputs.forEach((input) => {
                incomingOutputs[input.templateName] ??= [];
                incomingOutputs[input.templateName][input.outputIndex] ??= [];
                incomingOutputs[input.templateName][input.outputIndex].push([template, input]);
            });
            return incomingOutputs;
        },
        {}
    );

    function properties(properties: { [key: string]: string | number | undefined }): string {
        return `[${Object.entries(properties)
            .filter(([_, value]) => value !== undefined)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ')}]`;
    }

    function templateProperties(template: Template): string {
        let shape = TRANSACTION_SHAPE;
        if (template.name === TemplateNames.LOCKED_FUNDS) shape = INCOMING_FUNDS_SHAPE;
        else if (template.name === DISSECTION_NAME) shape = DISSECTION_SHAPE;
        else if (template.inputs.length === 0) shape = INCOMING_FUNDS_SHAPE;
        else if (!Object.keys(incomingOutputs).includes(template.name)) shape = PYABLE_SHAPE;
        let color;
        if (template.name === TemplateNames.LOCKED_FUNDS) color = LOCKED_FUNDS_COLOR;
        else if (template.name === DISSECTION_NAME) color = DISSECTION_COLOR;
        else if (template.role === AgentRoles.PROVER) color = PROVER_COLOR;
        else if (template.role === AgentRoles.VERIFIER) color = VERIFIER_COLOR;
        return properties({ shape, color, label: `"${template.name.replace(/_/g, '\\n')}"` });
    }

    function templateLine(template: Template): string {
        return `${template.name} ${templateProperties(template)}`;
    }

    function edgeProperties(
        template: Template,
        outputIndex: number,
        childTemplate?: Template,
        childInput?: Input
    ): string {
        let collectedProperties: { [key: string]: string | number | undefined } = {
            color:
                outputIndex > 0
                    ? SYMBOLIC_OUTPUT_COLOR
                    : template.name === TemplateNames.LOCKED_FUNDS
                      ? LOCKED_FUNDS_COLOR
                      : undefined
        };
        if (childTemplate && childInput) {
            if (childTemplate.name === `${TemplateNames.SELECT_UNCONTESTED}_00`)
                collectedProperties.weight = FIRST_SELECT_UNCONTESTED_WEIGHT;
            const condition = template.outputs[outputIndex].spendingConditions[childInput.spendingConditionIndex];
            collectedProperties.color =
                collectedProperties.color ?? (condition.nextRole === AgentRoles.PROVER ? PROVER_COLOR : VERIFIER_COLOR);
            if (condition.timeoutBlocks) {
                collectedProperties = {
                    ...collectedProperties,
                    style: TIMEOUT_STYLE,
                    label: `"${condition.timeoutBlocks} blocks"`
                };
            }
        } else
            collectedProperties = {
                ...collectedProperties,
                arrowhead: CONNECTOR_ARROWHEAD,
                weight: template.name === TemplateNames.LOCKED_FUNDS ? LOCKED_FUNDS_OUTPUT_WEIGHT : undefined
            };
        return properties(collectedProperties);
    }

    function isMultiparousOutput(template: Template, outputIndex: number): boolean {
        return (
            (incomingOutputs[template.name] &&
                incomingOutputs[template.name][outputIndex] &&
                incomingOutputs[template.name][outputIndex].length > 1) ||
            false
        );
    }

    function outputLine(template: Template, outputIndex: number): string[] {
        const isMulti = isMultiparousOutput(template, outputIndex);
        const connection = template.name + (isMulti ? `_output_${outputIndex}` : '');

        return [
            ...(isMulti
                ? [
                      `${connection} ${properties({ shape: CONNECTOR_SHAPE })}`,
                      `${template.name} -> ${connection} ${edgeProperties(template, outputIndex)}`
                  ]
                : []),
            ...((incomingOutputs[template.name] &&
                incomingOutputs[template.name][outputIndex] &&
                incomingOutputs[template.name][outputIndex].map(
                    ([childTemplate, input]) =>
                        `${connection} -> ${childTemplate.name} ` +
                        `${edgeProperties(template, outputIndex, childTemplate, input)}`
                )) ??
                [])
        ];
    }

    function outputLines(template: Template): string[] {
        return template.outputs.flatMap((output, outputIndex) => outputLine(template, outputIndex));
    }

    function horizontalAlignmentLines(): string[] {
        return templates
            .reduce(
                (groups, template) => {
                    if (template.inputs.length === 0) groups[0].push(template);
                    else if (template.name.match(/(state|select)_uncontested_00/)) groups[1].push(template);
                    return groups;
                },
                [[], []] as Template[][]
            )
            .map((templates) => `{rank=same; ${templates.map((template: Template) => template.name).join('; ')}}`);
    }

    function verticalAlignmentLines(): string[] {
        const root = templates.find((template) => template.name === TemplateNames.PROOF)!;
        const collected: { [key: string]: Template[] } = {
            mainSteps: [],
            stateUncontested: [],
            selectUncontested: []
        };
        const visited: Set<string> = new Set();
        const queue: Template[] = [root];
        while (queue.length > 0) {
            const template = queue.shift()!;
            if (visited.has(template.name)) continue;
            visited.add(template.name);

            if (template.name.startsWith(TemplateNames.STATE_UNCONTESTED)) collected.stateUncontested.push(template);
            else if (template.name.startsWith(TemplateNames.SELECT_UNCONTESTED))
                collected.selectUncontested.push(template);
            else if (
                template.name === TemplateNames.PROOF ||
                template.name.startsWith(TemplateNames.STATE) ||
                template.name.startsWith(TemplateNames.SELECT) ||
                template.name === TemplateNames.ARGUMENT ||
                template.name === TemplateNames.PROOF_REFUTED ||
                template.name === DISSECTION_NAME
            )
                collected.mainSteps.push(template);

            for (const output of incomingOutputs[template.name] ?? [])
                for (const childTemplate of output) queue.push(childTemplate[0]);
        }

        return Object.entries(collected)
            .filter(([_, list]) => list.length > 1)
            .map(
                ([name, list]) =>
                    list.map((template) => template.name).join(' -> ') +
                    ` [style=invis; weight=${VERTICAL_ALIGNMENT_WEIGHTS[name]}]`
            );
    }

    return `digraph BitSnark {${[
        '',
        ...templates.map(templateLine),
        ...horizontalAlignmentLines(),
        ...verticalAlignmentLines(),
        ...templates.flatMap(outputLines),
        `${TemplateNames.LOCKED_FUNDS} -> ${TemplateNames.PROOF_UNCONTESTED} [style=invis]`
    ].join('\n\t')}\n}`;
}

if (require.main === module) {
    const args = minimist(process.argv.slice(2));
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const collapsed = args['collapsed'];
    const db = new AgentDb(agentId);
    db.getTemplates(setupId)
        .then((templates) => {
            console.log(dot(templates, collapsed));
        })
        .catch((error) => {
            throw error;
        });
}
