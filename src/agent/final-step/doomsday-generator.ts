import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/step1/verifier';
import { InstrCode, Instruction } from '../../generator/step1/vm/types';
import { proof, vKey } from '../../generator/step1/constants';
import { Bitcoin, Template } from '../../generator/step3/bitcoin';
import { getSpendingConditionByInput, getTransactionByName, Transaction } from '../transactions-new';
import { bigintToNibblesLS } from './common';
import { array, TransactionNames, twoDigits } from '../common';
import { bigintToBufferBE, bufferToBigintBE, encodeWinternitz256_4, getWinternitzPublicKeys, WOTS_NIBBLES, WotsType } from '../winternitz';
import { step1_vm } from '../../generator/step1/vm/vm';
import { StackItem } from '../../generator/step3/stack';
import { verifyAddMod, verifyAnd, verifyAndBit, verifyAndNotBit, verifyAssertOne, verifyAssertZero, verifyDivMod, verifyEqual, verifyMov, verifyMulMod, verifyNot, verifyOr, verifySubMod } from './step1_btc';
import { Compressor } from '../simple-taptree';
import { agentConf } from '../agent.conf';
import { BLAKE3, Register } from './blake-3-4u';
import { Decasector } from './decasector';
import { combineHashes } from '../../common/taproot-common';
import { readTemplates } from '../db';
import { blake3 as blake3_wasm } from 'hash-wasm';

export class DoomsdayGenerator {

    cache: any = {};
    program: Instruction[];
    decasector: Decasector;

    constructor() {
        step1_vm.reset();
        groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
        if (!step1_vm.success?.value) throw new Error('Failed.');
        this.program = step1_vm.instructions;
        this.decasector = new Decasector(this.program.length);
    }

    private renderTemplateWithIndex(template: Template, index: number): Buffer {
        const nibbles = bigintToNibblesLS(BigInt(index), 8);
        const map: any = {};
        for (let i = 0; i < nibbles.length; i++) map[`indexNibbles_${i}`] = nibbles[i];
        template.items.forEach(item => {
            const b = Buffer.from([map[item.itemId]]);
            b.copy(template.buffer, item.index, 0, 1);
        });
        return template.buffer;
    }

    private renderTemplateWithKeys(template: Template, keys: Buffer[][]): Buffer {
        const keysFlat = keys.flat();
        template.items.forEach((item, i) => {
            const b = keysFlat[i];
            b.copy(template.buffer, item.index, 0);
        });
        return template.buffer;
    }

    private checkLine(bitcoin: Bitcoin, line: Instruction, a: StackItem[], b: StackItem[], c: StackItem[], d?: StackItem[]) {
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

    private paramWitness(bitcoin: Bitcoin): StackItem[] {
        return new Array(90).fill(0).map(_ => bitcoin.newStackItem(0));
    }

    private param(bitcoin: Bitcoin): StackItem[] {
        return new Array(86).fill(0).map(_ => bitcoin.newStackItem(0));
    }

    private generateRefuteInstructionTaproot(transactions: Transaction[]): Buffer {

        const lastSelect = getTransactionByName(transactions, `select_${twoDigits(this.decasector.iterations - 1)}`);
        const semiFinal = getTransactionByName(transactions, TransactionNames.ARGUMENT);

        const started = Date.now();
        let total = 0;
        let max = 0;
        const compressor = new Compressor(this.decasector.iterations, agentConf.internalPubkey);

        console.log(`Generating refute instruction taproot for ${this.program.length} instructions`);
        for (let index = 0; index < this.program.length; index++) {

            const line = this.program[index];

            if (index && index % 1000 == 0) {
                const todo = (this.program.length - index) * (Date.now() - started) / index;
                const m = Math.floor(todo / 60000);
                const s = Math.floor((todo - m * 60000) / 1000);
                console.log('index: ', index, '   max: ', max, '   total: ', total, '   left: ', `${m}:${s}`);
            }

            // this is a hack to make this run (somewhat) faster

            const cacheKey = `${line.name}/${line.bit ?? 0}`;
            let final = null;
            if (this.cache[cacheKey]) {

                const template: Template = this.cache[cacheKey];
                final = this.renderTemplateWithIndex(template, index);

            } else {

                const bitcoin = new Bitcoin();
                const stack = bitcoin.stack.items;

                const indexWitness = bigintToNibblesLS(BigInt(index), WOTS_NIBBLES[WotsType._24])
                    .map(n => bitcoin.addWitness(n));

                const w_a = this.paramWitness(bitcoin);
                const w_b = this.paramWitness(bitcoin);
                const w_c = this.paramWitness(bitcoin);
                let w_d: StackItem[] | undefined;
                if (line.name == InstrCode.MULMOD || line.name == InstrCode.DIVMOD) {
                    w_d = this.paramWitness(bitcoin);
                }

                // first output is the index
                bitcoin.verifyIndex(
                    lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0],
                    indexWitness, bigintToNibblesLS(BigInt(index), 8)
                );
                bitcoin.drop(indexWitness);

                // a is the first element of the merkle proof in the second output
                const a = this.param(bitcoin);
                bitcoin.winternitzDecode256(a, w_a, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![0]);
                bitcoin.drop(w_a);

                // b is the second element of the merkle proof in the second output
                const b = this.param(bitcoin);
                bitcoin.winternitzDecode256(b, w_b, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![1]);
                bitcoin.drop(w_b);

                // c is the third element of the merkle proof in the second output
                const c = this.param(bitcoin);
                bitcoin.winternitzDecode256(c, w_c, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![2]);
                bitcoin.drop(w_c);

                // d is the fourth element second output
                let d: StackItem[];
                if (w_d) {
                    d = this.param(bitcoin);
                    bitcoin.winternitzDecode256(d, w_d, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![3]);
                    bitcoin.drop(w_d);
                }

                this.checkLine(bitcoin, line, a, b, c, d!);
                const template = bitcoin.programToTemplate();
                this.cache[cacheKey] = template;
                final = template.buffer;
            }

            total += final.length;
            max = Math.max(max, final.length);

            compressor.addItem(final);
        }

        return compressor.getRoot();
    }

    private assertDoubleHash(
        blake3: BLAKE3, 
        leftNibbles: StackItem[], 
        rightNibbles: StackItem[], 
        resultNibbles: StackItem[]) {

        const rightRegs: Register[] = blake3.nibblesToRegisters(rightNibbles);
        const leftRegs: Register[] = blake3.nibblesToRegisters(leftNibbles);
        const resultRegs: Register[] = blake3.nibblesToRegisters(resultNibbles);

        const hashRegs = blake3.hash([...leftRegs, ...rightRegs]);
        blake3.bitcoin.drop([...leftRegs, ...rightRegs].flat());

        const temp = blake3.bitcoin.newStackItem(0);
        blake3.bitcoin.equalNibbles(temp, resultRegs.flat(), hashRegs.flat());
        blake3.bitcoin.drop(resultRegs.flat());
        blake3.bitcoin.drop(hashRegs.flat());
        blake3.bitcoin.assertZero(temp);
        blake3.bitcoin.drop(temp);
    }

    private async createRefuteHashTemplate(): Promise<Template> {

        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;
        const blake3 = new BLAKE3(bitcoin);
        blake3.initializeTables();

        const leftKeys = getWinternitzPublicKeys(WotsType._256_4, '');
        const rightKeys = getWinternitzPublicKeys(WotsType._256_4, '');
        const resultKeys = getWinternitzPublicKeys(WotsType._256_4, '');

        // mock values for self testing code
        const left = '12341234';
        const right = '98769876';
        const result = Buffer.from(await blake3_wasm(
            Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')])), 'hex');

        const leftWi = encodeWinternitz256_4(BigInt('0x' + left), '').map(b => bitcoin.addWitness(b));
        const rightWi = encodeWinternitz256_4(BigInt('0x' + right), '').map(b => bitcoin.addWitness(b));
        const resultWi = encodeWinternitz256_4(bufferToBigintBE(result), '').map(b => bitcoin.addWitness(b));

        const leftSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(leftSi, leftWi, leftKeys);
        bitcoin.drop(leftWi);

        const rightSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(rightSi, rightWi, rightKeys);
        bitcoin.drop(rightWi);

        const resultSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(resultSi, resultWi, resultKeys);
        bitcoin.drop(resultWi);

        this.assertDoubleHash(blake3, rightSi, leftSi, resultSi);
        return bitcoin.programToTemplate({ validateStack: true });
    }

    private async generateRefuteMerkleProofTaproot(transactions: Transaction[]): Promise<Buffer> {

        const compressor = new Compressor(this.decasector.iterations + 2, agentConf.internalPubkey);
        let template: Template | undefined = undefined;

        const started = Date.now();
        const total = 0;
        const max = 0;

        console.log(`Generating refute merkle proof taproot for ${this.program.length} instructions`);
        for (let index = 1; index < this.program.length; index++) {

            if (index && index % 10 == 0) {
                const todo = (this.program.length - index) * (Date.now() - started) / index;
                const m = Math.floor(todo / 60000);
                const s = Math.floor((todo - m * 60000) / 1000);
                console.log('index: ', index, '   max: ', max, '   total: ', total, '   left: ', `${m}:${s}`);
            }

            // first find the 2 roots for the 3 merkle proofs
            const stateCommitmentInfoBefore = this.decasector.getStateCommitmentsForRow(index)[0];
            const stateCommitmentInfoAfter = this.decasector.getStateCommitmentsForRow(index)[1];

            // transaction names start with 0 while state commitment count starts with 1, so -1 here
            const beforeStateIteration = stateCommitmentInfoBefore[0] - 1;
            const afterStateIteration = stateCommitmentInfoAfter[0] - 1;
            const stateCommitmentIndexBefore = stateCommitmentInfoBefore[1];
            const stateCommitmentIndexAfter = stateCommitmentInfoAfter[1];

            const stateTxBefore = getTransactionByName(transactions, `${TransactionNames.STATE}_${twoDigits(beforeStateIteration)}`);
            const scBefore = getSpendingConditionByInput(transactions, stateTxBefore.inputs[0]);
            const beforeRootKeys = scBefore.wotsPublicKeys![stateCommitmentIndexBefore];
            const stateTxAfter = getTransactionByName(transactions, `${TransactionNames.STATE}_${twoDigits(afterStateIteration)}`);
            const scAfter = getSpendingConditionByInput(transactions, stateTxAfter.inputs[0]);
            const afterRootKeys = scAfter.wotsPublicKeys![stateCommitmentIndexAfter];

            // now let's get the merkle proofs keys, there are 3 proofs, each with 12 hashes, each with 90 keys

            const merkleProofKeysAll: Buffer[][] = [];
            const argument = getTransactionByName(transactions, TransactionNames.ARGUMENT);
            // We need all of the inputs except the first two, which are the path and the a, b, c, d values
            for (let i = 2; i < argument.inputs.length; i++) {
                const input = argument.inputs[i];
                const sc = getSpendingConditionByInput(transactions, input);
                merkleProofKeysAll.push(...sc.wotsPublicKeys!);
            }
            // divide these into 3 sets of 12
            const merkleProofKeys: Buffer[][][] = [0, 1, 2].map(i => merkleProofKeysAll.slice(i * 12, (i + 1) * 12));

            // now add the value before the proof, and the root after it
            {
                const sc = getSpendingConditionByInput(transactions, argument.inputs[1]);
                merkleProofKeys[0].unshift(sc.wotsPublicKeys![0]); // a
                merkleProofKeys[1].unshift(sc.wotsPublicKeys![1]); // b
                merkleProofKeys[2].unshift(sc.wotsPublicKeys![2]); // c

                merkleProofKeys[0].push(beforeRootKeys);
                merkleProofKeys[1].push(beforeRootKeys);
                merkleProofKeys[2].push(afterRootKeys);
            }

            // here's the script to refute one hash

            const refuteHash = async (leftKeys: Buffer[], rightKeys: Buffer[], resultKeys: Buffer[]): Promise<Buffer> => {
                if (!template)
                    template = await this.createRefuteHashTemplate();

                return this.renderTemplateWithKeys(template, [leftKeys, rightKeys, resultKeys]);
            }

            // now there are 3 * 6 possible refutations
            for (let i = 0; i < merkleProofKeys.length; i++) {
                for (let j = 0; j < 12; j += 2) {
                    const script = await refuteHash(merkleProofKeys[i][j], merkleProofKeys[i][j + 1], merkleProofKeys[i][j + 2]);
                    compressor.addItem(script);
                }
            }
        }

        return compressor.getRoot();
    }

    async generateFinalStepTaproot(transactions: Transaction[]): Promise<Buffer> {
        const tr2 = await this.generateRefuteMerkleProofTaproot(transactions);
        const tr1 = this.generateRefuteInstructionTaproot(transactions);
        const root = combineHashes(tr1, tr2);
        return Compressor.toPubKey(agentConf.internalPubkey, root);
    }
}

async function main() {
    const ddg = new DoomsdayGenerator();
    const transactions = await readTemplates('bitsnark_prover_1', 'test_setup');
    const r = await ddg.generateFinalStepTaproot(transactions);
    console.log(r);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
