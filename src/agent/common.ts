import { SavedVm } from "../generator/common/saved-vm";
import groth16Verify, { Key, Proof } from "../generator/step1/verifier";
import { step1_vm } from "../generator/step1/vm/vm";
import { proof } from "./proof";
import { verificationKey } from "./verification-key";
import { InstrCode as Step1_InstrCode } from '../../src/generator/step1/vm/types';

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

export function getSavedStep1(): SavedVm<Step1_InstrCode> {
    groth16Verify(Key.fromSnarkjs(verificationKey), Proof.fromSnarkjs(proof));
    if (!step1_vm.success) throw new Error('Failed');
    step1_vm.optimizeRegs();
    return step1_vm.save();
}
