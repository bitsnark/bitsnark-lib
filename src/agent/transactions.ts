import { AgentRoles, numToStr2Digits, TransactionInfo } from "./common";
import { createChallengeTx } from "./steps/challenge";
import { createInitialTx } from "./steps/initial";
import { createStep1PatPartTx, createStep1VicPartTx } from "./steps/step1";

const step1Iterations = 19;

export enum ProtocolStep {
    INITIAL = 'INITIAL',
    CHALLENGE = 'CHALLENGE',
    STEP1 = 'STEP1',
    TRANSITION = 'TRANSITION',
    STEP2 = 'STEP2',
    FINAL = 'FINAL'
};

export type TransactionCreator = (setupId: string, proverPublicKey: bigint, verifierPublicKey: bigint, otsPublicKeys?: bigint[]) => TransactionInfo

export interface TransactionMeta {
    desc: string;
    role: AgentRoles;
    step: ProtocolStep;
    iteration?: number;
    creator: TransactionCreator;
}

export const allTransactions: TransactionMeta[] = [];

allTransactions.push(
    {
        desc: 'INITIAL',
        role: AgentRoles.PROVER,
        step: ProtocolStep.INITIAL,
        creator: createInitialTx
    },
    {
        desc: 'CHALLENGE',
        role: AgentRoles.VERIFIER,
        step: ProtocolStep.CHALLENGE,
        creator: createChallengeTx
    });

for (let i = 0; i < step1Iterations; i++) {
    let desc = `${numToStr2Digits(i * 2)}_STEP1_PAT`;
    allTransactions.push({
        desc,
        role: AgentRoles.PROVER,
        step: ProtocolStep.STEP1,
        creator: (setupId: string, k1: bigint, k2: bigint) => createStep1PatPartTx(i, setupId, k1, k2)
    });
    desc = `${numToStr2Digits(i * 2 + 1)}_STEP1_VIC`;
    allTransactions.push({
        desc,
        role: AgentRoles.VERIFIER,
        step: ProtocolStep.STEP1,
        creator: (setupId: string, k1: bigint, k2: bigint) => createStep1VicPartTx(i, setupId, k1, k2)
    });
}

export function getTransactionMeta(desc: string): TransactionMeta {
    const t = allTransactions.findIndex(t => t.desc == desc);
    return allTransactions[t];
}

export function getNextTransactionMeta(desc: string): TransactionMeta {
    const t = allTransactions.findIndex(t => t.desc == desc);
    return allTransactions[t + 1];
}

export function getPrevTransactionMeta(desc: string): TransactionMeta {
    const t = allTransactions.findIndex(t => t.desc == desc);
    return allTransactions[t - 1];
}
