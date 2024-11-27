export const iterations = 6;

export const enum TransactionNames {
    LOCKED_FUNDS = 'locked_funds',
    PROVER_STAKE = 'prover_stake',
    PROOF = 'proof',
    PROOF_UNCONTESTED = 'proof_uncontested',
    CHALLENGE = 'challenge',
    CHALLENGE_UNCONTESTED = 'challenge_uncontested',
    STATE = 'state',
    STATE_UNCONTESTED = 'state_uncontested',
    SELECT = 'select',
    SELECT_UNCONTESTED = 'select_uncontested',
    ARGUMENT = 'argument',
    ARGUMENT_UNCONTESTED = 'argument_uncontested',
    PROOF_REFUTED = 'proof_refuted'
}

export enum ProtocolStep {
    INITIAL = 'INITIAL',
    CHALLENGE = 'CHALLENGE',
    STEP1 = 'STEP1',
    TRANSITION = 'TRANSITION',
    STEP2 = 'STEP2',
    FINAL = 'FINAL'
}

export enum AgentRoles {
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER'
}

export interface TransactionInfo {
    setupId: string;
    desc: string;
    txId?: string;
    taprootAddress: Buffer;
    scripts: Buffer[];
    controlBlocks: Buffer[];
    wotsPublicKeys: bigint[];
    proverSignature?: Buffer;
    verifierSignature?: Buffer;
    value?: bigint;
}

export interface ScriptAndKeys {
    script: Buffer;
    wotsPublicKeys: bigint[];
}

export interface FundingUtxo {
    txId: string;
    outputIndex: number;
    amount: bigint;
    serializedTransaction?: Buffer;
    external: boolean;
}

export interface OperatorState {
    role: AgentRoles;
    lastTransactionReceieved: TransactionNames;
    lastTransactionSent: TransactionNames;
}
