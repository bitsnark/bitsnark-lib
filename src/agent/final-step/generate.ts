import fs from 'fs';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { InstrCode, Instruction } from '../../generator/step1/vm/types';
import { proof, vKey } from '../../generator/step1/constants';
import { Bitcoin, Template } from '../../generator/step3/bitcoin';
import { getSpendingConditionByInput, getTransactionByName, Transaction } from '../transactions-new';
import { bigintToNibblesLS } from './common';
import { iterations, TransactionNames, twoDigits } from '../common';
import { bufferToBigint160 } from '../../encoding/encoding';
import { getWinternitzPublicKeys, WOTS_NIBBLES, WotsType } from '../winternitz';
import { step1_vm } from '../../generator/step1/vm/vm';
import { StackItem } from '@src/generator/step3/stack';
import { verifyAddMod, verifyAnd, verifyAndBit, verifyAndNotBit, verifyAssertOne, verifyAssertZero, verifyDivMod, verifyEqual, verifyMov, verifyMulMod, verifyNot, verifyOr, verifySubMod } from './step1_btc';
import { Compressor } from '../simple-taptree';

const cache: any = {};

function indexToStr(index: number): string {
    let s = '' + index;
    while (s.length < 7) s = '0' + s;
    return s;
}

function paramWitness(bitcoin: Bitcoin): StackItem[] {
    return new Array(WOTS_NIBBLES[WotsType._256]).fill(0).map(_ => bitcoin.addWitness(0n));
}

function decodeParam(bitcoin: Bitcoin, semiFinal: Transaction, witness: StackItem[], dataIndex: number): StackItem[] {
    const nibbles = bitcoin.newNibbles(WOTS_NIBBLES[WotsType._256]);
    bitcoin.winternitzDecode256(
        nibbles,
        witness,
        semiFinal.outputs[0].spendingConditions[0].wotsPublicKeys![dataIndex].map(bufferToBigint160),
    );
    return nibbles.slice(0, -4);
}

function renderTemplate(template: Template, index: number): Buffer {
    const nibbles = bigintToNibblesLS(BigInt(index), 8);
    const map: any = {};
    for (let i = 0; i < nibbles.length; i++) map[`indexNibbles_${i}`] = nibbles[i];
    template.items.forEach(item => {
        const b = Buffer.from([ map[item.itemId] ]);
        b.copy(template.buffer, item.index, 0, 1);
    });
    return template.buffer;
}

function checkLine(bitcoin: Bitcoin, line: Instruction, a: StackItem[], b: StackItem[], c: StackItem[], d?: StackItem[]) {

    switch (line.name) {
        case InstrCode.ADDMOD:
            verifyAddMod(bitcoin, a, b, c);
            break;
        case InstrCode.ANDBIT:
            verifyAndBit(bitcoin, a, b, c, line.bit!);
            break;
        case InstrCode.ANDNOTBIT:
            verifyAndNotBit(bitcoin, a, b, c, line.bit!);
            break;
        case InstrCode.MOV:
            verifyMov(bitcoin, a, c);
            break;
        case InstrCode.EQUAL:
            verifyEqual(bitcoin, a, b, c);
            break;
        case InstrCode.MULMOD:
            verifyMulMod(bitcoin, a, b, c, d!);
            break;
        case InstrCode.OR:
            verifyOr(bitcoin, a, b, c);
            break;
        case InstrCode.AND:
            verifyAnd(bitcoin, a, b, c);
            break;
        case InstrCode.NOT:
            verifyNot(bitcoin, a, c);
            break;
        case InstrCode.SUBMOD:
            verifySubMod(bitcoin, a, b, c);
            break;
        case InstrCode.DIVMOD:
            verifyDivMod(bitcoin, a, b, c, d!);
            break;
        case InstrCode.ASSERTONE:
            verifyAssertOne(bitcoin, a);
            break;
        case InstrCode.ASSERTZERO:
            verifyAssertZero(bitcoin, a);
            break;
    }
}

export function generateRefuteInstructionTaproot(argument: Transaction): Buffer {

    const lastSelect = getTransactionByName(transactions, `select_${twoDigits(iterations - 1)}`);
    const semiFinal = getTransactionByName(transactions, TransactionNames.ARGUMENT);

    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.instructions;

    const started = Date.now();
    let total = 0;
    let max = 0;
    const compressor = new Compressor(iterations, 1n);

    for (let index = 0; index < program.length; index++) {

        const line = program[index];

        if (index && index % 1000 == 0) {
            const todo = (program.length - index) * (Date.now() - started) / index;
            const m = Math.floor(todo / 60000);
            const s = Math.floor((todo - m * 60000) / 1000);
            console.log('index: ', index, '   max: ', max, '   totel: ', total, '   left: ', `${m}:${s}`);
        }

        // this is a hack to make this run (somewhat) faster

        const cacheKey = `${line.name}/${line.bit ?? 0}`;
        let final = null;
        if (cache[cacheKey]) {

            const template: Template = cache[cacheKey];
            final = renderTemplate(template, index);

        } else {

            const bitcoin = new Bitcoin();
            const stack = bitcoin.stack.items;

            const indexWitness = bigintToNibblesLS(BigInt(index), WOTS_NIBBLES[WotsType._256])
                .map(n => bitcoin.addWitness(BigInt(n)));

            if (!lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys) {
                // no opponent public keys here, mock them
                lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys! = [getWinternitzPublicKeys(WotsType._256, '')];
            }

            if (!semiFinal.outputs[0].spendingConditions[0].wotsPublicKeys) {
                // no opponent public keys here, mock them
                semiFinal.outputs[0].spendingConditions[0].wotsPublicKeys = [
                    getWinternitzPublicKeys(WotsType._256, ''),
                    getWinternitzPublicKeys(WotsType._256, ''),
                    getWinternitzPublicKeys(WotsType._256, ''),
                    getWinternitzPublicKeys(WotsType._256, '')
                ];
            }

            const w_a = paramWitness(bitcoin);
            const w_b = paramWitness(bitcoin);
            const w_c = paramWitness(bitcoin);
            let w_d: StackItem[];
            if (line.name == InstrCode.MULMOD || line.name == InstrCode.DIVMOD) {
                w_d = paramWitness(bitcoin);
            }

            bitcoin.verifyIndex(
                lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0].map(bufferToBigint160),
                indexWitness, bigintToNibblesLS(BigInt(index), 8)
            );
            bitcoin.drop(indexWitness);

            const a = decodeParam(bitcoin, semiFinal, w_a, 0);
            bitcoin.drop(w_a);

            const b = decodeParam(bitcoin, semiFinal, w_b, 1);
            bitcoin.drop(w_b);

            const c = decodeParam(bitcoin, semiFinal, w_c, 2);
            bitcoin.drop(w_c);

            let d: StackItem[];
            if (line.name == InstrCode.MULMOD || line.name == InstrCode.DIVMOD) {
                d = decodeParam(bitcoin, semiFinal, w_d!, 3);
                bitcoin.drop(w_d!);
            }

            checkLine(bitcoin, line, a, b, c, d!);
            const template = bitcoin.programToTemplate();
            cache[cacheKey] = template;
            final = template.buffer;
        }

        total += final.length;
        max = Math.max(max, final.length);

        compressor.addItem(final);
    }

    return compressor.getScriptPubkey();
}

function generateRefuteMerkleTaproot(transactions: Transaction[], argument: Transaction) {

    // there are 3 merkle proofs in the argument, right after the index
    for (let i of [1, 2, 3]) {
        const sc = getSpendingConditionByInput(transactions, argument.inputs[i]);

        // Each one is a level 7 merkle proof, with added nodes along the path. 
        // The root was already given in one of the two last state transactions
        // We need to figure out which one

        


    });



}

export function generateFinalStepTaproot(transactions: Transaction[]): Buffer {
}
