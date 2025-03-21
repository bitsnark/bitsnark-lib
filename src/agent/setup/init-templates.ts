import { bigintToBufferBE } from '../common/encoding';
import {
    makeProtocolSteps,
    getSpendingConditionByInput,
    findOutputByInput,
    protocolStart,
    protocolEnd,
    assertOrder,
    getTemplateByName
} from '../common/templates';
import { AgentRoles, FundingUtxo, SignatureType, Template, TemplateNames } from '../common/types';
import { generateWotsPublicKeys } from './wots-keys';

export function initializeTemplates(
    role: AgentRoles,
    setupId: string,
    proverPublicKey: bigint,
    verifierPublicKey: bigint,
    payloadUtxo: FundingUtxo,
    proverUtxo: FundingUtxo
): Template[] {
    const templates = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];
    assertOrder(templates);

    const payload = getTemplateByName(templates, TemplateNames.LOCKED_FUNDS);
    payload.txid = payloadUtxo.txid;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTemplateByName(templates, TemplateNames.PROVER_STAKE);
    proverStake.txid = proverUtxo.txid;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // set ordinal, setup id and protocol version
    for (const [i, t] of templates.entries()) {
        t.setupId = setupId;
        t.ordinal = i;
    }

    // Copy timeouts from spending conditions to their inputs, so CHECKSEQUENCEVERIFY can verify the nSequence.
    for (const t of templates) {
        for (const input of t.inputs) {
            input.nSequence = getSpendingConditionByInput(templates, input).timeoutBlocks;
        }
    }

    // Put index in each object to make it easier later!
    for (const template of templates) {
        for (const [inputIndex, input] of template.inputs.entries()) {
            input.index = inputIndex;
        }
        for (const [outputIndex, output] of template.outputs.entries()) {
            output.index = outputIndex;
            for (const [spendingConditionIndex, spendingCondition] of output.spendingConditions.entries()) {
                spendingCondition.index = spendingConditionIndex;
            }
        }
    }

    // Put schnorr keys where needed.
    for (const t of templates) {
        for (const input of t.inputs.values()) {
            const output = findOutputByInput(templates, input);
            const spend = output.spendingConditions[input.spendingConditionIndex];
            if (!spend) throw new Error('Invalid spending condition: ' + input.spendingConditionIndex);
            spend.signaturesPublicKeys = [];
            if (spend.signatureType == SignatureType.PROVER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(bigintToBufferBE(proverPublicKey, 256));
            }
            if (spend.signatureType == SignatureType.VERIFIER || spend.signatureType == SignatureType.BOTH) {
                spend.signaturesPublicKeys.push(bigintToBufferBE(verifierPublicKey, 256));
            }
        }
    }

    generateWotsPublicKeys(setupId, templates, role);

    for (const t of templates) {
        if (t.isExternal) continue;
        // check every input has a spending condition to spend
        for (const input of t.inputs) {
            // throw if sc not found
            getSpendingConditionByInput(templates, input);
        }
    }

    return templates;
}
