export const ONE_SATOSHI = 1n;
export const ONE_BITCOIN = ONE_SATOSHI * (10n ** 8n);

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
    keyPairs: { [key: string]: { public: string, private: string } };
};

export const agentConf: AgentConf = {

    internalPubkey: BigInt(process.env['INTERNAL_PUBKEY'] ?? 1),

    timeoutBlocks: 5,
    smallTimeoutBlocks: 6,
    largeTimeoutBlocks: 18,

    payloadAmount: ONE_BITCOIN * 10n,
    proverStakeAmount: ONE_BITCOIN * 2n,
    verifierPaymentAmount: ONE_BITCOIN,
    symbolicOutputAmount: ONE_SATOSHI,

    feePerByte: ONE_SATOSHI * 20n,
    feeFactorPercent: 125,

    winternitzSecret: process.env['WOTS_SECRET'] ?? 'no rest for the wicked',
    tokens: {
        'bitsnark_prover_1': process.env['TELEGRAM_TOKEN_PROVER'] ?? '7368302319:AAGtvHOBQErcZPuJ0cD3Ele9G0FSDgg0Ct4',
        'bitsnark_verifier_1': process.env['TELEGRAM_TOKEN_VERIFIER'] ?? '7457777046:AAF7-6cNqn9MCP6sak2A30fcSOgD78QRn3Y'
    },
    keyPairs: {
        'bitsnark_prover_1': {
            public: process.env['PROVER_SCHNORR_PUBLIC'] ?? '02ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75',
            private: process.env['PROVER_SCHNORR_PRIVATE'] ?? '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2'
        },
        'bitsnark_verifier_1': {
            public: process.env['VERIFIER_SCHNORR_PUBLIC'] ?? '0386ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79',
            private: process.env['VERIFIER_SCHNORR_PRIVATE'] ?? 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0'
        }
    }
};
