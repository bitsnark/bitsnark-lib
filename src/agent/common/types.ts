import { WotsType } from './winternitz';

export const iterations = 6;

export enum TemplateNames {
    LOCKED_FUNDS = 'LOCKED_FUNDS',
    PROVER_STAKE = 'PROVER_STAKE',
    PROOF = 'PROOF',
    PROOF_UNCONTESTED = 'PROOF_UNCONTESTED',
    CHALLENGE = 'CHALLENGE',
    CHALLENGE_UNCONTESTED = 'CHALLENGE_UNCONTESTED',
    STATE = 'STATE',
    STATE_UNCONTESTED = 'STATE_UNCONTESTED',
    SELECT = 'SELECT',
    SELECT_UNCONTESTED = 'SELECT_UNCONTESTED',
    ARGUMENT = 'ARGUMENT',
    ARGUMENT_UNCONTESTED = 'ARGUMENT_UNCONTESTED',
    PROOF_REFUTED = 'PROOF_REFUTED'
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
    txid?: string;
    inputs: Input[];
    outputs: Output[];
    status?: TemplateStatus;
    protocolData?: string[];
}
