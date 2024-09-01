import { AgentRoles, TransactionInfo } from "./common";
import { createChallengeTx } from "./steps/challenge";
import { createInitialTx } from "./steps/initial";
import { createStep1PatPartTx, createStep1VicPartTx } from "./steps/step1";

const step1Iterations = 19;

function numToStr2Digits(i: number): string {
    return i < 10 ? `${i}` : `0${i}`;
}

export type TransactionCreator = (proverPublicKey: bigint, verifierPublicKey: bigint) => TransactionInfo

export const transactionDescs: string[] = [
    '00_INITIAL_PAT', 
    '01_CHALLENGE_VIC',
];

export const transactionCreators: any = {
    '00_INITIAL_PAT': createInitialTx,
    '01_CHALLENGE_VIC': createChallengeTx,
};

for (let i = 0; i < step1Iterations; i++) {
    let desc = `${numToStr2Digits(i * 2)}_STEP1_PAT`;
    transactionDescs.push(desc);
    transactionCreators[desc] = ((k1: bigint, k2: bigint) => createStep1PatPartTx(i, k1, k2));
    desc = `${numToStr2Digits(i * 2 + 1)}_STEP1_VIC`;
    transactionDescs.push(desc);
    transactionCreators[desc] = ((k1: bigint, k2: bigint) => createStep1VicPartTx(i, k1, k2));
}

export function getNextTransactionDesc(s: string): string {
    const t = transactionDescs.findIndex(ts => s == ts);
    return transactionDescs[t + 1];
}

export function getPrevTransactionDesc(s: string): string {
    const t = transactionDescs.findIndex(ts => s == ts);
    return transactionDescs[t - 1];
}

export function getTransactionsDescsForRole(role: AgentRoles): string[] {
    return transactionDescs.filter(s => s.includes(role == AgentRoles.PROVER ? 'PAT' : 'VIC'));
}
