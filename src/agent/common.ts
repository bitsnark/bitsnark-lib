import { SavedVm } from '../generator/common/saved-vm';
import groth16Verify, { Key, Proof } from '../generator/ec_vm/verifier';
import { step1_vm } from '../generator/ec_vm/vm/vm';
import { proof } from './proof';
import { verificationKey } from './verification-key';
import { InstrCode as Step1_InstrCode } from '../generator/ec_vm/vm/types';

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

export const iterations = 6;

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

export function getSavedStep1(): SavedVm<Step1_InstrCode> {
    groth16Verify(Key.fromSnarkjs(verificationKey), Proof.fromSnarkjs(proof));
    if (!step1_vm.success) throw new Error('Failed');
    step1_vm.optimizeRegs();
    return step1_vm.save();
}

export const twoDigits = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export function random(bytes: number): bigint {
    let n = 0n;
    for (let i = 0; i < bytes; i++) {
        n = n << 8n;
        n += BigInt(Math.round(255 * Math.random()) & 0xff);
    }
    return n;
}

export function jsonStringifyCustom<T>(obj: T): string {
    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'bigint') return `0x${value.toString(16)}n`;
        if (value?.type == 'Buffer' && value.data) {
            return 'hex:' + Buffer.from(value.data).toString('hex');
        }
        return value;
    });
}

export function jsonParseCustom<T>(json: string): T {
    return JSON.parse(json, (key, value) => {
        if (typeof value === 'string' && value.startsWith('0x') && value.endsWith('n'))
            return BigInt(value.replace('n', ''));
        if (typeof value === 'string' && value.startsWith('hex:')) return Buffer.from(value.replace('hex:', ''), 'hex');
        return value;
    }) as T;
}

export function range(start: number, end: number): number[] {
    return new Array(end - start).fill(0).map((_, i) => i);
}

export function array<T>(count: number, f?: ((i: number) => T) | T): T[] {
    if (f && typeof f == 'function') return new Array(count).fill(0).map((_, i) => (f as (i: number) => T)(i));
    return new Array(count).fill(f);
}

export function last<T>(a: T[]): T {
    return a[a.length - 1];
}

export function first<T>(a: T[]): T {
    return a[0];
}

export function butLast<T>(a: T[]): T[] {
    return a.slice(0, a.length - 1);
}

export function butFirst<T>(a: T[]): T[] {
    return a.slice(1);
}
