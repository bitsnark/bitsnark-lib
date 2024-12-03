import { WotsType } from "./winternitz";

export const iterations = 6;

export const enum TemplateNames {
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

export enum SetupStatus {
    PENDING = 'PENDING',
    UNSIGNED = 'UNSIGNED',
    SIGNED = 'SIGNED',
    FAILED = 'FAILED',
    ACTIVE = 'ACTIVE',
    PEGOUT_SUCCESSFUL = 'PEGOUT_SUCCESSFUL',
    PEGOUT_FAILED = 'PEGOUT_FAILED'
}

export interface ScriptAndKeys {
    script: Buffer;
    wotsPublicKeys: bigint[];
}

export interface FundingUtxo {
    txid: string;
    outputIndex: number;
    amount: bigint;
}

export interface Setup {
    id: string;
    protocolVersion?: string;
    status: SetupStatus;
    lastCheckedBlockHeight?: number;
    wotsSalt: string;
    payloadTxid?: string;
    payloadOutputIndex?: number;
    payloadAmount?: bigint;
    stakeTxid?: string;
    stakeOutputIndex?: number;
    stakeAmount?: bigint;
}

export enum SignatureType {
    NONE = 'NONE',
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER',
    BOTH = 'BOTH'
}

export interface SpendingCondition {
    index?: number;
    timeoutBlocks?: number;
    signatureType: SignatureType;
    signaturesPublicKeys?: Buffer[];
    nextRole: AgentRoles;
    wotsSpec?: WotsType[];
    wotsPublicKeys?: Buffer[][];
    script?: Buffer;
    exampleWitness?: Buffer[][];
    wotsPublicKeysDebug?: string[][];
    controlBlock?: Buffer;
}

export interface Input {
    index?: number;
    transactionId?: string;
    templateName: string;
    outputIndex: number;
    spendingConditionIndex: number;
    nSequence?: number;
    data?: bigint[];
    script?: Buffer;
    controlBlock?: Buffer;
    proverSignature?: string;
    verifierSignature?: string;
    wotsPublicKeys?: Buffer[][];
}

export interface Output {
    index?: number;
    taprootKey?: Buffer;
    amount?: bigint;
    spendingConditions: SpendingCondition[];
}

export interface OperatorState {
    role: AgentRoles;
    lastTransactionReceieved: TemplateNames;
    lastTransactionSent: TemplateNames;
}

export enum TemplateStatus {
    PENDING = 'PENDING',
    READY = 'READY',
    PUBLISHED = 'PUBLISHED',
    REJECTED = 'REJECTED'
}

export interface Template {
    id?: number;
    name: string;
    role: AgentRoles;
    isExternal?: boolean;
    unknownTxid?: boolean;
    ordinal?: number;
    setupId?: string;
    protocolVersion?: string;
    txid?: string;
    inputs: Input[];
    outputs: Output[];
    status?: TemplateStatus;
}

