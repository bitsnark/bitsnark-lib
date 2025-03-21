import dotenv from 'dotenv';

import { parse } from '../common/env-parser';

dotenv.config({ path: ['.env.test', '.env.local', '.env'] });

export const ONE_SATOSHI = 1n;
export const ONE_BITCOIN = ONE_SATOSHI * 10n ** 8n;

interface AgentConf {
    internalPubkey: bigint;
    timeoutBlocks: number;
    smallTimeoutBlocks: number;
    largeTimeoutBlocks: number;
    payloadAmount: bigint;
    proverStakeAmount: bigint;
    verifierPaymentAmount: bigint;
    symbolicOutputAmount: bigint;
    feePerVbyte: bigint;
    feeFactorPercent: number;
    winternitzSecret: string;
    tokens: { [key: string]: string };
    keyPairs: { [key: string]: { schnorrPublic: string; schnorrPrivate: string } };
    bitcoinNodeNetwork: string;
    bitcoinNodeUsername: string;
    bitcoinNodePassword: string;
    bitcoinNodeHost: string;
    bitcoinNodePort: number;
    postgresUser: string;
    postgresHost: string;
    postgresPort: number;
    postgresPassword: string;
    postgresBigints: boolean;
    postgresKeepAlive: boolean;
    blocksUntilFinalized: number;
    protocolVersion: string;
    useMockProgram: boolean;
    protocolIntervalMs: number;
    blockCheckIntervalMs: number;
    telegramChannelId: string;
    bitcoinFeeRateForExternal: number;
}

export const agentConf: AgentConf = {
    internalPubkey: parse.bigint(
        'INTERNAL_PUBKEY',
        0x0000000000000000000000000000000000000000000000000000000000000001n
    ),
    timeoutBlocks: parse.integer('TIMEOUT_BLOCKS', 5),
    smallTimeoutBlocks: parse.integer('SMALL_TIMEOUT_BLOCKS', 180),
    largeTimeoutBlocks: parse.integer('LARGE_TIMEOUT_BLOCKS', 360),

    payloadAmount: parse.bigint('PAYLOAD_AMOUNT', ONE_BITCOIN * 10n),
    proverStakeAmount: parse.bigint('PROVER_STAKE_AMOUNT', ONE_BITCOIN * 2n),
    verifierPaymentAmount: parse.bigint('VERIFIER_PAYMENT_AMOUNT', ONE_BITCOIN),

    // Must set an amount that is greater than dust limit.
    // Note that dust limit actually depends on the specific output:
    // https://github.com/bitcoin/bitcoin/blob/6463117a29294f6ddc9fafecfd1e9023956cc41b/src/policy/policy.cpp#L26
    symbolicOutputAmount: parse.bigint('SYMBOLIC_OUTPUT_AMOUNT', ONE_SATOSHI * 546n),

    feePerVbyte: parse.bigint('FEE_PER_BYTE', ONE_SATOSHI * 20n),
    feeFactorPercent: parse.integer('FEE_FACTOR_PERCENT', 125),

    winternitzSecret: parse.string('WOTS_SECRET', 'no rest for the wicked'),
    tokens: {
        bitsnark_prover_1: parse.string('TELEGRAM_TOKEN_PROVER', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
        bitsnark_verifier_1: parse.string('TELEGRAM_TOKEN_VERIFIER', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
    },
    keyPairs: {
        bitsnark_prover_1: {
            schnorrPublic: parse.string(
                'PROVER_SCHNORR_PUBLIC',
                'e4b62e6dd05a73e8028af4682dfc03afb26352356ba84d78aa35e4de40ccbc03'
            ),
            schnorrPrivate: parse.string(
                'PROVER_SCHNORR_PRIVATE',
                '79c79d4f2132389f14c7c27c1490491913d3df7a4bf461b589cf6af9eb897868'
            )
        },
        bitsnark_verifier_1: {
            schnorrPublic: parse.string(
                'VERIFIER_SCHNORR_PUBLIC',
                'a203ba071c97e7d9754a9e295773365971eb77d1bc7197b3428e7e44ee8c1a41'
            ),
            schnorrPrivate: parse.string(
                'VERIFIER_SCHNORR_PRIVATE',
                '65e5e34cdd118aca0c2f512762e95db121840e4750f3fec6c66078f82e067135'
            )
        }
    },
    bitcoinNodeNetwork: parse.string('BITCOIN_NODE_NETWORK', 'regtest'),
    bitcoinNodeUsername: parse.string('BITCOIN_NODE_USERNAME', 'rpcuser'),
    bitcoinNodePassword: parse.string('BITCOIN_NODE_PASSWORD', 'rpcpassword'),
    bitcoinNodeHost: parse.string('BITCOIN_NODE_HOST', '127.0.0.1'),
    bitcoinNodePort: parse.integer('BITCOIN_NODE_PORT', 18443),
    postgresUser: parse.string('POSTGRES_USER', 'postgres'),
    postgresHost: parse.string('POSTGRES_HOST', 'localhost'),
    postgresPort: parse.integer('POSTGRES_PORT', 5432),
    postgresPassword: parse.string('POSTGRES_PASSWORD', '1234'),
    postgresBigints: parse.boolean('POSTGRES_BIGINTS', true),
    postgresKeepAlive: parse.boolean('POSTGRES_KEEP_ALIVE', true),
    blocksUntilFinalized: parse.integer('BLOCKS_UNTIL_FINALIZED', 0), // 6
    protocolVersion: parse.string('PROTOCOL_VERSION', '0.2'),
    useMockProgram: parse.boolean('USE_MOCK_PROGRAM', false),
    protocolIntervalMs: parse.integer('PROTOCOL_INTERVAL_MS', 1000),
    blockCheckIntervalMs: parse.integer('BLOCK_CHECK_INTERVAL_MS', 1000),
    telegramChannelId: parse.string('TELEGRAM_CHANNEL_ID', '-1002148850465'),
    bitcoinFeeRateForExternal: parse.number('BITCOIN_FEE_RATE', 0.001) // fee rate in BTC per KB
};
