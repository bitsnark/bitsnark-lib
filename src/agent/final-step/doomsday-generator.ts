import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { Bitcoin, ScriptTemplate } from '../../generator/btc_vm/bitcoin';
import { getSpendingConditionByInput, getTemplateByName, twoDigits } from '../common/templates';
import { encodeWinternitz24, encodeWinternitz256_4, getWinternitzPublicKeys, WotsType } from '../common/winternitz';
import { StackItem } from '../../generator/btc_vm/stack';
import { Compressor } from '../common/taptree';
import { BLAKE3, Register } from './blake-3-4u';
import { blake3 as blake3_wasm } from 'hash-wasm';
import { modInverse } from '../../generator/common/math-utils';
import { prime_bigint } from '../common/constants';
import { bufferToBigintBE } from '../common/encoding';
import { bigintToNibbles_3 } from './nibbles';
import { NegifyFinalStep } from './negify-final-step';
import { Template, TemplateNames } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { ForkCommand, ForkYourself } from '../fork/fork-yourself';
import { GenerateFinalTaprootCommand } from '../fork/fork-entrypoint';
import { parallelize } from '../common/parallelize';
import { array } from '../common/array-utils';
import { loadProgram } from '../setup/groth16-verify';
import { Decasector } from '../setup/decasector';

export enum RefutationType {
    INSTR,
    HASH
}

export interface GenerateTaprootResult {
    taprootHash: Buffer;
}

export interface ScriptDescriptor {
    refutationType: RefutationType;
    line: number;
    whichProof?: number;
    whichHash?: number;
}

export class DoomsdayGenerator {
    agentId: string;
    setupId: string;
    program: Instruction[];
    decasector: Decasector;
    forker = new ForkYourself(ForkCommand.DOOMSDAY);

    constructor(agentId: string, setupId: string) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.program = loadProgram().program;
        this.decasector = new Decasector();
    }

    private renderTemplateWithIndex(template: ScriptTemplate, index: number): Buffer {
        const nibbles = bigintToNibbles_3(BigInt(index), 8);
        const map: { [key: string]: number } = {};
        for (let i = 0; i < nibbles.length; i++) {
            map[`indexNibbles_${i}`] = nibbles[i];
        }
        template.items.forEach((item) => {
            const b = Buffer.from([map[item.itemId]]);
            b.copy(template.buffer, item.index, 0, 1);
        });
        return template.buffer;
    }

    private renderScriptTemplateWithKeys(scriptTemplate: ScriptTemplate, keys: Buffer[][]): Buffer {
        const keysFlat = keys.flat();
        scriptTemplate.items.forEach((item, i) => {
            const b = keysFlat[i];
            b.copy(scriptTemplate.buffer, item.index, 0);
        });
        return scriptTemplate.buffer;
    }

    // return true if the line succeeds!!!
    public checkLine(index: number, a: bigint, b: bigint, c: bigint, d?: bigint): boolean {
        const line = this.program[index];
        switch (line.name) {
            case InstrCode.ADDMOD:
                return c == (a + b) % prime_bigint;
            case InstrCode.ANDBIT:
                return c == (a & (1n << BigInt(line.bit!)) ? b : 0n);
            case InstrCode.ANDNOTBIT:
                return c == (a & (1n << BigInt(line.bit!)) ? 0n : b);
            case InstrCode.MOV:
                return a == c;
            case InstrCode.EQUAL:
                return c != 0n ? a == b : a != b;
            case InstrCode.MULMOD:
                return c == (a * b) % prime_bigint;
            case InstrCode.OR:
                return c != 0n ? a != 0n || b != 0n : a == 0n && b == 0n;
            case InstrCode.AND:
                return c != 0n ? a != 0n && b != 0n : a == 0n || b == 0n;
            case InstrCode.NOT:
                return c != 0n ? a == 0n : a != 0n;
            case InstrCode.SUBMOD:
                return c == (prime_bigint + a - b) % prime_bigint;
            case InstrCode.DIVMOD:
                try {
                    return c == a * modInverse(b, prime_bigint);
                } catch (e) {
                    return false;
                }
            case InstrCode.ASSERTONE:
                return a == 1n;
            case InstrCode.ASSERTZERO:
                return a == 0n;
        }
    }

    private checkLineBitcoin(
        bitcoin: Bitcoin,
        line: Instruction,
        a: StackItem[],
        b: StackItem[],
        c: StackItem[],
        d?: StackItem[]
    ) {
        const negifier = new NegifyFinalStep(bitcoin);

        switch (line.name) {
            case InstrCode.ADDMOD:
                negifier.negifyAddMod(a, b, c);
                break;
            case InstrCode.ANDBIT:
                negifier.negifyAndBit(a, b, c, line.bit!);
                break;
            case InstrCode.ANDNOTBIT:
                negifier.negifyAndNotBit(a, b, c, line.bit!);
                break;
            case InstrCode.MOV:
                negifier.negifyMov(a, c);
                break;
            case InstrCode.EQUAL:
                negifier.negifyEqual(a, b, c);
                break;
            case InstrCode.MULMOD:
                negifier.negifyMulMod(a, b, c, d!);
                break;
            case InstrCode.OR:
                negifier.negifyOr(a, b, c);
                break;
            case InstrCode.AND:
                negifier.negifyAnd(a, b, c);
                break;
            case InstrCode.NOT:
                negifier.negifyNot(a, c);
                break;
            case InstrCode.SUBMOD:
                negifier.negifySubMod(a, b, c);
                break;
            case InstrCode.DIVMOD:
                negifier.negifyDivMod(a, b, c, d!);
                break;
            case InstrCode.ASSERTONE:
                negifier.negifyNumOne(a);
                break;
            case InstrCode.ASSERTZERO:
                negifier.negifyNumZero(a);
                break;
        }
    }

    private generateRefuteInstructionTaproot(
        transactions: Template[],
        indexFrom: number,
        indexTo: number
    ): GenerateTaprootResult {
        const leaves = 2 ** Math.ceil(Math.log2(indexTo - indexFrom));
        const compressor = new Compressor(leaves);

        const lastSelect = getTemplateByName(
            transactions,
            `${TemplateNames.SELECT}_${twoDigits(this.decasector.iterations - 1)}`
        );
        const semiFinal = getTemplateByName(transactions, TemplateNames.ARGUMENT);

        const cache: { [key: string]: ScriptTemplate } = {};

        for (let index = indexFrom; index < indexTo; index++) {
            const line = this.program[index];

            // this is a hack to make this run (somewhat) faster

            const cacheKey = `${line.name}/${line.bit ?? 0}`;
            let final = null;
            if (cache[cacheKey]) {
                const scriptTemplate: ScriptTemplate = cache[cacheKey];
                final = this.renderTemplateWithIndex(scriptTemplate, index);
            } else {
                const bitcoin = new Bitcoin();
                bitcoin.throwOnFail = false;
                const stack = bitcoin.stack.items;

                const indexWitness = encodeWinternitz24(BigInt(index), '').map((b) => bitcoin.addWitness(b));

                const w_a = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
                const w_b = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
                const w_c = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
                let w_d: StackItem[] | undefined;
                if (line.name == InstrCode.MULMOD || line.name == InstrCode.DIVMOD) {
                    w_d = encodeWinternitz256_4(0n, '').map((b) => bitcoin.addWitness(b));
                }

                // first output is the index
                bitcoin.verifyIndex(
                    indexWitness,
                    lastSelect.outputs[0].spendingConditions[0].wotsPublicKeys![0],
                    bigintToNibbles_3(BigInt(index), 8)
                );
                bitcoin.drop(indexWitness);

                // a is the first element in the second output
                const a_4 = bitcoin.newNibbles(64);
                bitcoin.winternitzDecode256_4(a_4, w_a, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![0]);
                bitcoin.drop(w_a);
                const a = bitcoin.nibbles4To3(a_4);
                bitcoin.drop(a_4);

                // b is the second element in the second output
                const b_4 = bitcoin.newNibbles(64);
                bitcoin.winternitzDecode256_4(b_4, w_b, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![1]);
                bitcoin.drop(w_b);
                const b = bitcoin.nibbles4To3(b_4);
                bitcoin.drop(b_4);

                // c is the third element in the second output
                const c_4 = bitcoin.newNibbles(64);
                bitcoin.winternitzDecode256_4(c_4, w_c, lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![2]);
                bitcoin.drop(w_c);
                const c = bitcoin.nibbles4To3(c_4);
                bitcoin.drop(c_4);

                // d is the fourth element second output
                let d: StackItem[];
                if (w_d) {
                    const d_4 = bitcoin.newNibbles(64);
                    bitcoin.winternitzDecode256_4(
                        d_4,
                        w_d,
                        lastSelect.outputs[1].spendingConditions[0].wotsPublicKeys![3]
                    );
                    bitcoin.drop(w_d);
                    d = bitcoin.nibbles4To3(d_4);
                    bitcoin.drop(d_4);
                }

                this.checkLineBitcoin(bitcoin, line, a, b, c, d!);
                const scriptTemplate = bitcoin.programToTemplate();
                cache[cacheKey] = scriptTemplate;
                final = scriptTemplate.buffer;
            }

            compressor.addItem(final);
        }

        return { taprootHash: compressor.getRoot() };
    }

    private assertPairHash(
        blake3: BLAKE3,
        leftNibbles: StackItem[],
        rightNibbles: StackItem[],
        resultNibbles: StackItem[]
    ) {
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

    private async createRefuteHashScriptTemplate(): Promise<ScriptTemplate> {
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
        const result = Buffer.from(
            await blake3_wasm(Buffer.concat([Buffer.from(left, 'hex'), Buffer.from(right, 'hex')])),
            'hex'
        );

        const leftWi = encodeWinternitz256_4(BigInt('0x' + left), '').map((b) => bitcoin.addWitness(b));
        const rightWi = encodeWinternitz256_4(BigInt('0x' + right), '').map((b) => bitcoin.addWitness(b));
        const resultWi = encodeWinternitz256_4(bufferToBigintBE(result), '').map((b) => bitcoin.addWitness(b));

        const leftSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(leftSi, leftWi, leftKeys);
        bitcoin.drop(leftWi);

        const rightSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(rightSi, rightWi, rightKeys);
        bitcoin.drop(rightWi);

        const resultSi = bitcoin.newNibbles(64);
        bitcoin.winternitzDecode256_4(resultSi, resultWi, resultKeys);
        bitcoin.drop(resultWi);

        this.assertPairHash(blake3, rightSi, leftSi, resultSi);
        return bitcoin.programToTemplate({ validateStack: true });
    }

    public async generateRefuteMerkleProofTaproot(
        templates: Template[],
        indexFrom: number,
        indexTo: number
    ): Promise<GenerateTaprootResult> {
        const leaves = 2 ** Math.ceil(3 * 6 * Math.log2(indexTo - indexFrom));
        const compressor = new Compressor(leaves);
        let scriptTemplate: ScriptTemplate | undefined = undefined;
        for (let index = indexFrom; index < indexTo; index++) {
            if (index == 0) continue;

            // first find the 2 roots for the 3 merkle proofs
            const stateCommitmentBefore = this.decasector.stateCommitmentByLine[index - 1];
            const stateCommitmentAfter = this.decasector.stateCommitmentByLine[index];

            // transaction names start with 0 while state commitment count starts with 1, so -1 here
            const beforeStateIteration = stateCommitmentBefore.iteration - 1;
            const afterStateIteration = stateCommitmentAfter.iteration - 1;
            const stateCommitmentIndexBefore = stateCommitmentBefore.selection;
            const stateCommitmentIndexAfter = stateCommitmentAfter.selection;

            if (beforeStateIteration < 0) continue;

            const stateTxBefore = getTemplateByName(
                templates,
                `${TemplateNames.STATE}_${twoDigits(beforeStateIteration)}`
            );
            const scBefore = getSpendingConditionByInput(templates, stateTxBefore.inputs[0]);
            const beforeRootKeys = scBefore.wotsPublicKeys![stateCommitmentIndexBefore];

            const stateTxAfter = getTemplateByName(
                templates,
                `${TemplateNames.STATE}_${twoDigits(afterStateIteration)}`
            );
            const scAfter = getSpendingConditionByInput(templates, stateTxAfter.inputs[0]);
            const afterRootKeys = scAfter.wotsPublicKeys![stateCommitmentIndexAfter];

            // now let's get the merkle proofs keys, there are 3 proofs
            const merkleProofKeysAll: Buffer[][] = [];
            const argument = getTemplateByName(templates, TemplateNames.ARGUMENT);

            // We need all of the inputs except the first two, which are the path and the a, b, c, d values
            for (let i = 2; i < argument.inputs.length; i++) {
                const input = argument.inputs[i];
                const sc = getSpendingConditionByInput(templates, input);
                merkleProofKeysAll.push(...sc.wotsPublicKeys!);
            }
            // divide these into 3 sets of 13
            const merkleProofKeys: Buffer[][][] = [0, 1, 2].map((i) => merkleProofKeysAll.slice(i * 13, (i + 1) * 13));

            // now add the value before the proof, and the root after it
            {
                const sc = getSpendingConditionByInput(templates, argument.inputs[1]);
                merkleProofKeys[0].unshift(sc.wotsPublicKeys![0]); // a
                merkleProofKeys[1].unshift(sc.wotsPublicKeys![1]); // b
                merkleProofKeys[2].unshift(sc.wotsPublicKeys![2]); // c

                merkleProofKeys[0].push(beforeRootKeys);
                merkleProofKeys[1].push(beforeRootKeys);
                merkleProofKeys[2].push(afterRootKeys);
            }

            if (!scriptTemplate) scriptTemplate = await this.createRefuteHashScriptTemplate();

            // here's the script to refute one hash
            const refuteHash = async (
                leftKeys: Buffer[],
                rightKeys: Buffer[],
                resultKeys: Buffer[]
            ): Promise<Buffer> => {
                return this.renderScriptTemplateWithKeys(scriptTemplate!, [leftKeys, rightKeys, resultKeys]);
            };

            // now there are 3 * 7 possible refutations
            for (let i = 0; i < merkleProofKeys.length; i++) {
                for (let j = 0; j < 14; j += 2) {
                    const script = await refuteHash(
                        merkleProofKeys[i][j],
                        merkleProofKeys[i][j + 1],
                        merkleProofKeys[i][j + 2]
                    );
                    compressor.addItem(script);
                }
            }
        }

        return { taprootHash: compressor.getRoot() };
    }

    chunkTheWork(): GenerateFinalTaprootCommand[] {
        const lines = this.program.length;
        const chunks = 8;
        const chunk = Math.ceil(lines / chunks);
        const inputs: GenerateFinalTaprootCommand[] = array(chunks, (i) => ({
            agentId: this.agentId,
            setupId: this.setupId,
            indexFrom: i * chunk,
            indexTo: Math.min(lines, (i + 1) * chunk)
        }));
        return inputs;
    }

    async generateFinalStepTaprootChunk(
        templates: Template[],
        indexFrom: number,
        indexTo: number
    ): Promise<GenerateTaprootResult> {
        const compressor = new Compressor(2);
        const s1 = await this.generateRefuteInstructionTaproot(templates, indexFrom, indexTo);
        compressor.addHash(s1.taprootHash);
        const s2 = await this.generateRefuteMerkleProofTaproot(templates, indexFrom, indexTo);
        compressor.addHash(s2.taprootHash);
        return { taprootHash: compressor.getRoot() };
    }

    async generateFinalStepTaprootParallel(): Promise<{ taprootPubKey: Buffer }> {
        const start = Date.now();
        console.log('Starting doomsday parallel...');
        const inputs = this.chunkTheWork();
        const results = await parallelize<GenerateFinalTaprootCommand, GenerateTaprootResult>(inputs, (input) =>
            this.forker.fork(input)
        );
        const compressor = new Compressor(inputs.length);
        results.forEach((r) => compressor.addHash(r.taprootHash));

        const time = Date.now() - start;
        console.log(`Finished doomsday   -  ${Math.round(time / 60000)}m`);

        return {
            taprootPubKey: compressor.getTaprootPubkey()
        };
    }

    async generateFinalStepTaproot(): Promise<{ taprootPubKey: Buffer }> {
        const db = new AgentDb(this.agentId);
        const templates = await db.getTemplates(this.setupId);
        const inputs = this.chunkTheWork();
        const start = Date.now();
        console.log('Starting doomsday...');
        const results: GenerateTaprootResult[] = [];
        for (let i = 0; i < inputs.length; i++) {
            const start = Date.now();
            console.log('Starting chunk ' + i);
            const r = await this.generateFinalStepTaprootChunk(templates, inputs[i].indexFrom, inputs[i].indexTo);
            results.push(r);
            const time = Date.now() - start;
            console.log(`Finished chunk ${i}  -  ${Math.round(time / 60000)}m`);
        }
        const compressor = new Compressor(inputs.length);
        results.forEach((r) => compressor.addHash(r.taprootHash));

        const time = Date.now() - start;
        console.log(`Finished doomsday   -  ${Math.round(time / 60000)}m`);

        return {
            taprootPubKey: compressor.getTaprootPubkey()
        };
    }
}

async function main() {
    const agentId = 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const parallel = process.argv.some((s) => s == '--parallel');
    const ddg = new DoomsdayGenerator(agentId, setupId);
    const r = parallel ? await ddg.generateFinalStepTaprootParallel() : await ddg.generateFinalStepTaproot();
    console.log(r);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
