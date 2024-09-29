import fs from 'fs';
import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { InstrCode, Instruction, InstrCode as Step1_InstrCode } from '../../generator/step1/vm/types';
import { proof, vKey } from '../../generator/step1/constants';
import { Bitcoin } from '../../generator/step3/bitcoin';
import { getTransactionByName, getTransactionFileNames, loadTransactionFromFile, Transaction } from '../transactions-new';
import { bigintToNibblesLS } from './common';
import { bufferToBigint160, iterations, twoDigits } from '../common';
import { getWinternitzPublicKeys, WOTS_NIBBLES, WotsType } from '../winternitz';
import { step1_vm, VM as Step1_vm } from '../../generator/step1/vm/vm';
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

function getScriptForLine(bitcoin: Bitcoin, line: Instruction, a: StackItem[], b: StackItem[], c: StackItem[], d?: StackItem[]): Buffer {

    // const cacheKey = `${line.name}/${line.bit ?? 0}`;

    // if (cache[cacheKey]) {
    //     return cache[`${line.name}/${line.bit ?? 0}`]
    // }

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

    const script = bitcoin.programToBinary();
    //cache[cacheKey] = script;
    return script;
}

export function generateFinalStepTaproot(setupId: string, transactions: Transaction[]) {

    fs.mkdirSync(`./generated/scripts/${setupId}`, { recursive: true });

    const lastSelect = getTransactionByName(transactions, `select_${twoDigits(iterations - 1)}`);
    const semiFinal = getTransactionByName(transactions, 'semi_final');

    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.instructions;

    const started = Date.now();
    let total = 0;
    let max = 0;
    const compressor = new Compressor(iterations);

    program.forEach((line, index) => {

        
        // if (line.name != InstrCode.MULMOD) return;

        if (index % 100 == 0) {
            const todo = (program.length - index) * (Date.now() - started) / index;
            const h = Math.floor(todo / 3600000);
            const m = Math.floor((todo - h * 3600000) / 60000);
            console.log('index: ', index, '   max: ', max, '   totel: ', total, '   left: ', `${h}:${m}`);
        }

        const bitcoin = new Bitcoin();
        const stack = bitcoin.stack.items;
        bitcoin.setDefaultHash('HASH160');

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

        bitcoin.checkIndex(
            lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0].map(bufferToBigint160),
            indexWitness
        );
        bitcoin.drop(indexWitness);

        // this is a hack to make this run (somewhat) faster

        const cacheKey = `${line.name}/${line.bit ?? 0}`;
        let final = null;
        if (cache[cacheKey]) {
            const earlierScript: Buffer = cache[cacheKey];
            const indexCheckOnly = bitcoin.programToBinary();
            indexCheckOnly.copy(earlierScript, 0, 0, earlierScript.length);
            final = earlierScript;
        } else {
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
    
            final = getScriptForLine(bitcoin, line, a, b, c, d!);
            cache[cacheKey] = final;
        }

        total += final.length;
        max = Math.max(max, final.length);

        // fs.writeFileSync(`./generated/scripts/${setupId}/${indexToStr(index)}.bin`,
        //     script
        // );

        compressor.addItem(final);
    });

    semiFinal.outputs[0].taprootKey = compressor.getRoot();
}

var scriptName = __filename;
if (process.argv[1] == scriptName) {
    const filenames = getTransactionFileNames('test_setup');
    const transactions = filenames.map(fn => loadTransactionFromFile('test_setup', fn));
    generateFinalStepTaproot('test_setup', transactions);
}
