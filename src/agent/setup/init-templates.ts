import { bigintToBufferBE } from '../common/encoding';
import {
    makeProtocolSteps,
    getSpendingConditionByInput,
    findOutputByInput,
    protocolStart,
    protocolEnd,
    assertOrder,
    getTemplateByName,
} from '../common/templates';
import { AgentRoles, FundingUtxo, SignatureType, Template, TemplateNames } from '../common/types';
import { generateWotsPublicKeys } from './wots-keys';

const PROTOCOL_VERSION = '1.1';

export function initializeTemplates(
    role: AgentRoles,
    setupId: string,
    wotdSalt: string,
    proverPublicKey: bigint,
    verifierPublicKey: bigint,
    payloadUtxo: FundingUtxo,
    proverUtxo: FundingUtxo
): Template[] {
    const templates = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];
    assertOrder(templates);

    for (const t of templates) {
        t.inputs.forEach((input, i) => (input.index = i));
        t.outputs.forEach((output, i) => {
            output.index = i;
            output.spendingConditions.forEach((sc, i) => (sc.index = i));
        });
    }

    const payload = getTemplateByName(templates, TemplateNames.LOCKED_FUNDS);
    payload.txid = payloadUtxo.txid;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTemplateByName(templates, TemplateNames.PROVER_STAKE);
    proverStake.txid = proverUtxo.txid;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // set ordinal, setup id and protocol version
    for (const [i, t] of templates.entries()) {
        t.protocolVersion = t.protocolVersion ?? PROTOCOL_VERSION;
        t.setupId = setupId;
        t.ordinal = i;
    }

    generateWotsPublicKeys(wotdSalt, templates, role);

    // Copy timeouts from spending conditions to their inputs, so CHECKSEQUENCEVERIFY can verify the nSequence.
    for (const t of templates) {
        for (const input of t.inputs) {
            input.nSequence = getSpendingConditionByInput(templates, input).timeoutBlocks;
        }
    }

    // put schnorr keys where needed

    for (const t of templates) {
        for (const [inputIndex, input] of t.inputs.entries()) {
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

    // put index in each object to make it easier later!
    templates.forEach((t) => t.inputs.forEach((i, index) => (i.index = index)));
    templates.forEach((t) =>
        t.outputs.forEach((o, index) => {
            o.index = index;
            o.spendingConditions.forEach((sc, index) => (sc.index = index));
        })
    );

    return templates;
}
