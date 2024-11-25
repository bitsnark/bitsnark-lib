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
    feePerByte: bigint;
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
}

export const agentConf: AgentConf = {
    internalPubkey: parse.bigint('INTERNAL_PUBKEY', 1n),
    timeoutBlocks: parse.integer('TIMEOUT_BLOCKS', 5),
    smallTimeoutBlocks: parse.integer('SMALL_TIMEOUT_BLOCKS', 6),
    largeTimeoutBlocks: parse.integer('LARGE_TIMEOUT_BLOCKS', 18),

    payloadAmount: parse.bigint('PAYLOAD_AMOUNT', ONE_BITCOIN * 10n),
    proverStakeAmount: parse.bigint('PROVER_STAKE_AMOUNT', ONE_BITCOIN * 2n),
    verifierPaymentAmount: parse.bigint('VERIFIER_PAYMENT_AMOUNT', ONE_BITCOIN),

    // Must set an amount that is greater than dust limit.
    // Note that dust limit actually depends on the specific output:
    // https://github.com/bitcoin/bitcoin/blob/6463117a29294f6ddc9fafecfd1e9023956cc41b/src/policy/policy.cpp#L26
    symbolicOutputAmount: parse.bigint('SYMBOLIC_OUTPUT_AMOUNT', ONE_SATOSHI * 546n),

    feePerByte: parse.bigint('FEE_PER_BYTE', ONE_SATOSHI * 20n),
    feeFactorPercent: parse.integer('FEE_FACTOR_PERCENT', 125),

    winternitzSecret: parse.string('WOTS_SECRET', 'no rest for the wicked'),
    tokens: {
        bitsnark_prover_1: parse.string('TELEGRAM_TOKEN_PROVER', '7368302319:AAGtvHOBQErcZPuJ0cD3Ele9G0FSDgg0Ct4'),
        bitsnark_verifier_1: parse.string('TELEGRAM_TOKEN_VERIFIER', '7457777046:AAF7-6cNqn9MCP6sak2A30fcSOgD78QRn3Y')
    },
    keyPairs: {
        bitsnark_prover_1: {
            schnorrPublic: parse.string(
                'PROVER_SCHNORR_PUBLIC',
                'ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75'
            ),
            schnorrPrivate: parse.string(
                'PROVER_SCHNORR_PRIVATE',
                '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2'
            )
        },
        bitsnark_verifier_1: {
            schnorrPublic: parse.string(
                'VERIFIER_SCHNORR_PUBLIC',
                '86ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79'
            ),
            schnorrPrivate: parse.string(
                'VERIFIER_SCHNORR_PRIVATE',
                'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0'
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
    protocolIntervalMs: parse.integer('PROTOCOL_INTERVAL_MS', 30000)
};
