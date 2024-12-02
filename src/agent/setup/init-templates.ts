import { bigintToBufferBE } from '../common/encoding';
import {
    getTransactionByName,
    makeProtocolSteps,
    getSpendingConditionByInput,
    findOutputByInput,
    SignatureType,
    protocolStart,
    protocolEnd,
    assertOrder,
    Transaction
} from '../common/transactions';
import { AgentRoles, FundingUtxo, TransactionNames } from '../common/types';
import { agentConf } from '../agent.conf';
import { AgentDb } from '../common/db';
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
): Transaction[] {
    const transactions = [...protocolStart, ...makeProtocolSteps(), ...protocolEnd];
    assertOrder(transactions);

    for (const t of transactions) {
        t.inputs.forEach((input, i) => (input.index = i));
        t.outputs.forEach((output, i) => {
            output.index = i;
            output.spendingConditions.forEach((sc, i) => (sc.index = i));
        });
    }

    const payload = getTransactionByName(transactions, TransactionNames.LOCKED_FUNDS);
    payload.txId = payloadUtxo.txId;
    payload.outputs[0].amount = payloadUtxo.amount;

    const proverStake = getTransactionByName(transactions, TransactionNames.PROVER_STAKE);
    proverStake.txId = proverUtxo.txId;
    proverStake.outputs[0].amount = proverUtxo.amount;

    // set ordinal, setup id and protocol version
    for (const [i, t] of transactions.entries()) {
        t.protocolVersion = t.protocolVersion ?? PROTOCOL_VERSION;
        t.setupId = setupId;
        t.ordinal = i;
    }

    generateWotsPublicKeys(wotdSalt, transactions, role);

    // Copy timeouts from spending conditions to their inputs, so CHECKSEQUENCEVERIFY can verify the nSequence.
    for (const t of transactions) {
        for (const input of t.inputs) {
            input.nSequence = getSpendingConditionByInput(transactions, input).timeoutBlocks;
        }
    }

    // put schnorr keys where needed

    for (const t of transactions) {
        for (const [inputIndex, input] of t.inputs.entries()) {
            const output = findOutputByInput(transactions, input);
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
    transactions.forEach((t) => t.inputs.forEach((i, index) => (i.index = index)));
    transactions.forEach((t) =>
        t.outputs.forEach((o, index) => {
            o.index = index;
            o.spendingConditions.forEach((sc, index) => (sc.index = index));
        })
    );

    return transactions;
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);

    console.log('Initializing transactions...');
    const transactions = initializeTemplates(
        AgentRoles.PROVER,
        setupId,
        'salt',
        1n,
        2n,
        {
            txId: '0000000000000000000000000000000000000000000000000000000000000000',
            outputIndex: 0,
            amount: agentConf.payloadAmount,
            external: true
        },
        {
            txId: '1111111111111111111111111111111111111111111111111111111111111111',
            outputIndex: 0,
            amount: agentConf.proverStakeAmount,
            external: true
        }
    );

    console.log('Creating setup...');
    await db.insertNewSetup(setupId, transactions);

    console.log('Done.');
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
