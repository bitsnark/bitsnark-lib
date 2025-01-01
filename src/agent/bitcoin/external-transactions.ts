import minimist from 'minimist';
import { BitcoinNode } from '../common/bitcoin-node';
import { Template } from '../common/types';
import {
    createLockedFundsExternalAddresses,
    createProverStakeExternalAddresses
} from '../setup/create-external-addresses';
import { agentConf } from '../agent.conf';
import { satsToBtc } from './common';

const bitcoinNode = new BitcoinNode();
const client = bitcoinNode.client;

export function getTotalOutputAmount(template: Template): number {
    const total = template.outputs.reduce((p, c) => p + (c.amount ?? 0n), 0n);
    return Number(total) / 100000000;
}

export async function createRawTx(taprootAddress: string, amountInBtc: number): Promise<string> {
    // Define recipients and amounts
    const recipients = [
        {
            [taprootAddress]: amountInBtc // Replace with Taproot recipient address and amount in BTC
        }
    ];

    // Call walletcreatefundedpsbt
    const options = {
        inputs: [], // Optional: Specify UTXOs (leave empty for automatic selection)
        outputs: recipients,
        locktime: 0, // Optional: Set locktime (e.g., current block height for timelocks)
        options: {
            changePosition: 1,
            feeRate: agentConf.bitcoinFeeRateForExternal // Optional: Set fee rate in BTC per KB
        }
    };
    const psbt = (await client.command(
        'walletcreatefundedpsbt',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options.inputs as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options.outputs as any,
        options.locktime,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        options.options as any
    )) as { psbt: string };
    const processedPsbt = (await client.command('walletprocesspsbt', psbt.psbt)) as { psbt: string };
    const finalizedPsbt = (await client.command('finalizepsbt', processedPsbt.psbt)) as {
        complete: boolean;
        hex: string;
    };
    if (!finalizedPsbt.complete) {
        throw new Error('PSBT could not be finalized');
    }

    // Raw transaction in hex format
    const rawTxHex = finalizedPsbt.hex;
    return rawTxHex;
}

export async function rawTransactionToTxid(rawTxHex: string): Promise<string> {
    const decodedTx = (await client.command('decoderawtransaction', rawTxHex)) as { txid: string };
    return decodedTx.txid as string;
}

export async function transmitRawTransaction(rawTxHex: string): Promise<string> {
    const txid = (await client.command('sendrawtransaction', rawTxHex)) as string;
    return txid;
}

export async function createFundingTxid(taprootAddress: string, amountInBtc: number): Promise<string> {
    const rawTxHex = await createRawTx(taprootAddress, amountInBtc);
    return await rawTransactionToTxid(rawTxHex);
}

export async function sendExternalTransaction(taprootAddress: string, amountInBtc: number): Promise<string> {
    const rawTxHex = await createRawTx(taprootAddress, amountInBtc);
    const txid = (await client.command('sendrawtransaction', rawTxHex)) as string;
    return txid;
}

async function main() {
    const args = minimist(process.argv.slice(2), { boolean: ['send'] });
    const proverAgentId = args['prover-agent-id'] ?? 'bitsnark_prover_1';
    const verifierAgentId = args['verifier-agent-id'] ?? 'bitsnark_verifier_1';
    const setupId = args['setup-id'] ?? 'test_setup';
    const send = !!args['send'];

    const lockedFundsAddress = createLockedFundsExternalAddresses(proverAgentId, verifierAgentId, setupId);

    const proverStakeAddress = createProverStakeExternalAddresses(proverAgentId, verifierAgentId, setupId);

    const lockedFundsRawTx = await createRawTx(lockedFundsAddress, satsToBtc(agentConf.payloadAmount));
    const lockedFundsTxid = await rawTransactionToTxid(lockedFundsRawTx);
    console.log('lockedFundsTxid:', lockedFundsTxid);

    const proverStakeRawTx = await createRawTx(proverStakeAddress, satsToBtc(agentConf.proverStakeAmount));
    const proverStakeTxid = await rawTransactionToTxid(proverStakeRawTx);
    console.log('proverStakeTxid:', proverStakeTxid);

    if (send) {
        await transmitRawTransaction(lockedFundsRawTx);
        await transmitRawTransaction(proverStakeRawTx);
    }
}

if (require.main === module) {
    main();
}
