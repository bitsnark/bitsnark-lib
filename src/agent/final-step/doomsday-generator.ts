import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { Compressor } from '../common/taptree';
import { Template } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { ForkCommand, ForkYourself } from '../fork/fork-yourself';
import { GenerateFinalTaprootCommand } from '../fork/fork-entrypoint';
import { parallelize } from '../common/parallelize';
import { array } from '../common/array-utils';
import { loadProgram } from '../setup/groth16-verify';
import { Decasector } from '../setup/decasector';
import minimist from 'minimist';
import {
    createRefutationScript,
    getMaxRefutationIndex,
    getRefutationDescriptor,
    getRefutationIndex,
    RefutationDescriptor,
    RefutationType
} from './refutation';
import { getHash } from '../../../src/common/taproot-common';
import { prime_bigint } from '../common/constants';
import { modInverse } from '../../generator/common/math-utils';

function timeStr(ms: number): string {
    ms /= 1000;
    const h = `${Math.round(ms / 3600)}h`;
    ms %= 3600; // remove hours
    const m = `${Math.round(ms / 60)}m`;
    ms %= 60; // remove minutes
    const s = `${Math.round(ms)}s`;
    return [h, m, s].filter((x) => x).join(':');
}

interface ChunkResult {
    hashes: Buffer[];
    requestedScript?: Buffer;
}

interface GenerateTaprootResult {
    taprootHash: Buffer;
    taprootPubKey?: Buffer;
    requestedScript?: Buffer;
    requestedControlBlock?: Buffer;
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

    chunkTheWork(chunks: number, requestedScriptIndex?: number): GenerateFinalTaprootCommand[] {
        const total = getMaxRefutationIndex();
        const chunk = Math.floor(total / chunks);
        const inputs: GenerateFinalTaprootCommand[] = array(chunks, (i) => ({
            agentId: this.agentId,
            setupId: this.setupId,
            from: i * chunk,
            to: Math.min(total, (i + 1) * chunk),
            requestedScriptIndex
        }));
        return inputs;
    }

    // return true if the line succeeds!!!
    public checkLine(index: number, a: bigint, b: bigint, c: bigint): boolean {
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
                } catch {
                    return false;
                }
            case InstrCode.ASSERTONE:
                return a == 1n;
            case InstrCode.ASSERTZERO:
                return a == 0n;
        }
    }

    async generateFinalStepTaprootChunk(
        templates: Template[],
        from: number,
        to: number,
        requestedScriptIndex?: number
    ): Promise<ChunkResult> {
        const hashes: Buffer[] = [];
        let requestedScript: Buffer | undefined = undefined;
        for (let i = from; i < to; i++) {
            try {
                const rd = getRefutationDescriptor(i);
                const script = await createRefutationScript(this.decasector, templates, rd);
                if (i == requestedScriptIndex) {
                    requestedScript = script;
                }
                hashes.push(getHash(script));
            } catch (e) {
                console.error(e);
                throw new Error('Failed to generate refutation script, index: ' + i);
            }
        }
        return { hashes, requestedScript };
    }

    async generateFinalStepTaprootParallel(
        refutationDescriptor?: RefutationDescriptor
    ): Promise<GenerateTaprootResult> {

        refutationDescriptor = {
            refutationType: RefutationType.INSTR,
            line: 3
        };

        const start = Date.now();
        console.log('Starting doomsday parallel...');
        const requestedScriptIndex = refutationDescriptor ? getRefutationIndex(refutationDescriptor) : undefined;
        let inputs = this.chunkTheWork(10000, requestedScriptIndex);
        inputs = [inputs[0]];

        const results = await parallelize<GenerateFinalTaprootCommand, ChunkResult>(inputs, async (input) => {
            return this.forker.fork(input);
        });
        const allHashes = results.flatMap((r) => r.hashes);
        const compressor = new Compressor(allHashes.length, requestedScriptIndex);
        allHashes.forEach((h) => compressor.addHash(h));
        const requestedScript = results.find((r) => r.requestedScript)?.requestedScript;
        const requestedControlBlock = refutationDescriptor ? compressor.getControlBlock() : undefined;

        const time = Date.now() - start;
        console.log(`Finished doomsday   -  ${timeStr(time)}`);

        const ret = {
            taprootHash: compressor.getRoot(),
            taprootPubKey: compressor.getTaprootPubkey(),
            requestedScript,
            requestedControlBlock
        };
        return ret;
    }

    async generateFinalStepTaproot(refutationDescriptor?: RefutationDescriptor): Promise<GenerateTaprootResult> {

        refutationDescriptor = {
            refutationType: RefutationType.INSTR,
            line: 3
        };

        const db = new AgentDb(this.agentId);
        const templates = await db.getTemplates(this.setupId);
        const inputs = this.chunkTheWork(10000);
        const requestedScriptIndex = refutationDescriptor ? getRefutationIndex(refutationDescriptor) : undefined;

        const start = Date.now();
        console.log('Starting doomsday...');

        const results: ChunkResult[] = [];
        for (let i = 0; i < inputs.length; i++) {
            const start = Date.now();
            console.log(`Starting chunk ${i} of ${inputs.length}`);

            const r = await this.generateFinalStepTaprootChunk(
                templates,
                inputs[i].from,
                inputs[i].to,
                requestedScriptIndex
            );
            results.push(r);

            break;
            
            const time = Date.now() - start;
            console.log(`Finished chunk ${i} of ${inputs.length}   -   ${timeStr(time)}`);
        }

        const allHashes = results.flatMap((r) => r.hashes);
        const compressor = new Compressor(allHashes.length, requestedScriptIndex);
        allHashes.forEach((h) => compressor.addHash(h));
        const requestedScript = results.find((r) => r.requestedScript)?.requestedScript;
        const requestedControlBlock = refutationDescriptor ? compressor.getControlBlock() : undefined;

        const time = Date.now() - start;
        console.log(`Finished doomsday   -  ${timeStr(time)}`);

        return {
            taprootHash: compressor.getRoot(),
            taprootPubKey: compressor.getTaprootPubkey(),
            requestedScript,
            requestedControlBlock
        };
    }
}

async function main() {
    const args = minimist(process.argv.slice(2));
    const agentId = args['agent-id'] ?? 'bitsnark_prover_1';
    const setupId = args['setup-id'] ?? 'test_setup';
    const parallel = !!args['parallel'];
    const ddg = new DoomsdayGenerator(agentId, setupId);
    const r = parallel
        ? await ddg.generateFinalStepTaprootParallel(getRefutationDescriptor(123))
        : await ddg.generateFinalStepTaproot();
    console.log(r);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
