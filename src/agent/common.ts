import { SavedVm } from "../generator/common/saved-vm";
import groth16Verify, { Key, Proof } from "../generator/step1/verifier";
import { step1_vm } from "../generator/step1/vm/vm";
import { proof } from "./proof";
import { verificationKey } from "./verification-key";
import { InstrCode as Step1_InstrCode } from '../../src/generator/step1/vm/types';

export const enum TransactionNames {
    LOCKED_FUNDS = 'locked_funds',
    PROVER_STAKE = 'prover_stake',
    PROOF = 'proof',
    PROOF_UNCONTESTED = 'proof_uncontested',
    VERIFIER_PAYMENT = 'verifier_payment',
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

export const iterations = 19;

export enum ProtocolStep {
    INITIAL = 'INITIAL',
    CHALLENGE = 'CHALLENGE',
    STEP1 = 'STEP1',
    TRANSITION = 'TRANSITION',
    STEP2 = 'STEP2',
    FINAL = 'FINAL'
};

export enum AgentRoles {
    PROVER = 'PROVER',
    VERIFIER = 'VERIFIER'
}

export interface TransactionInfo {
    setupId: string;
    desc: string;
    txId?: string,
    taprootAddress: Buffer;
    scripts: Buffer[];
    controlBlocks: Buffer[];
    wotsPublicKeys: bigint[];
    proverSignature?: Buffer;
    verifierSignature?: Buffer;
    value?: bigint;
}

export interface ScriptAndKeys {
    script: Buffer,
    wotsPublicKeys: bigint[]
}

export interface FundingUtxo {
    txId: string;
    outputIndex: number;
    amount: bigint;
}

export function bigintToString(n: bigint): string {
    return n.toString(16);
}

export function stringToBigint(s: string): bigint {
    return BigInt('0x' + s);
}

export function numToStr2Digits(i: number): string {
    return i < 10 ? `${i}` : `0${i}`;
}

export function bufferToBigint160(b: Buffer): bigint {
    if (b.length != 20) throw new Error('Invalid size');
    return BigInt('0x' + b.toString('hex'));
}

export function getSavedStep1(): SavedVm<Step1_InstrCode> {
    groth16Verify(Key.fromSnarkjs(verificationKey), Proof.fromSnarkjs(proof));
    if (!step1_vm.success) throw new Error('Failed');
    step1_vm.optimizeRegs();
    return step1_vm.save();
}

export const twoDigits = (n: number) => n < 10 ? `0${n}` : `${n}`;
