import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { Compressor, DEAD_ROOT_HASH } from '../common/taptree';
import { Template } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { ForkCommand, ForkYourself } from '../fork/fork-yourself';
import { GenerateFinalTaprootCommand } from '../fork/fork-entrypoint';
import { array } from '../common/array-utils';
import { loadProgram } from '../setup/groth16-verify';
import { Decasector } from '../setup/decasector';
import minimist from 'minimist';
import {
    createRefutationScript,
    getMaxRefutationIndex,
    getRefutationDescriptor,
    getRefutationIndex,
    RefutationDescriptor
} from './refutation';
import { getHash } from '../../../src/common/taproot-common';
import { prime_bigint } from '../common/constants';
import { modInverse } from '../../generator/common/math-utils';
import { parallelize } from '../common/parallelize';

const allHashesCache: { [key: string]: Buffer[] } = {};

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

    chunkTheWork(chunks: number): GenerateFinalTaprootCommand[] {
        const total = getMaxRefutationIndex();
        const chunk = Math.ceil(total / chunks);
        const inputs: GenerateFinalTaprootCommand[] = array(chunks, (i) => ({
            agentId: this.agentId,
            setupId: this.setupId,
            from: i * chunk,
            to: Math.min(total, (i + 1) * chunk),
            skip: false
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

    async generateFinalStepTaprootChunk(templates: Template[], from: number, to: number): Promise<ChunkResult> {
        const hashes: Buffer[] = [];
        for (let i = from; i < to; i++) {
            try {
                const rd = getRefutationDescriptor(i);
                const script = await createRefutationScript(this.decasector, templates, rd);
                hashes.push(getHash(script));
            } catch (e) {
                console.error(e);
                throw new Error('Failed to generate refutation script, index: ' + i);
            }
        }
        return { hashes };
    }

    async generateFinalStepTaprootParallel(
        refutationDescriptor?: RefutationDescriptor
    ): Promise<GenerateTaprootResult> {
        const start = Date.now();
        console.log('Starting doomsday parallel...');

        const requestedScriptIndex = refutationDescriptor ? getRefutationIndex(refutationDescriptor) : 0;

        let allHashes = allHashesCache[this.setupId];
        if (!allHashes) {
            const inputs = this.chunkTheWork(128);
            // inputs.forEach(i => i.skip = i.from > 8800000 || i.to < 8800000);

            const results = await parallelize<GenerateFinalTaprootCommand, ChunkResult>(inputs, async (input) => {
                if (input.skip) {
                    return { hashes: array(input.to - input.from, DEAD_ROOT_HASH) };
                }
                return this.forker.fork(input);
            });

            if (results.length != inputs.length || results.some((r) => !r || !r.hashes || r.hashes.length == 0))
                throw new Error('Missing results');

            allHashes = results.flatMap((r) => r.hashes);
            allHashesCache[this.setupId] = allHashes;
        }

        const compressor = new Compressor(allHashes.length, requestedScriptIndex);
        allHashes.forEach((h) => compressor.addHash(h));
        compressor.getRoot();
        compressor.getTaprootPubkey();

        const time = Date.now() - start;
        console.log(`Finished doomsday   -  ${timeStr(time)}`);

        let requestedScript;
        const requestedControlBlock = refutationDescriptor ? compressor.getControlBlock() : undefined;
        if (refutationDescriptor) {
            const db = new AgentDb(this.agentId);
            const templates = await db.getTemplates(this.setupId);
            requestedScript = await createRefutationScript(this.decasector, templates, refutationDescriptor);
        }

        const ret = {
            taprootHash: compressor.getRoot(),
            taprootPubKey: compressor.getTaprootPubkey(),
            requestedScript,
            requestedControlBlock
        };
        return ret;
    }

    async generateFinalStepTaproot(refutationDescriptor?: RefutationDescriptor): Promise<GenerateTaprootResult> {
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

            if (inputs[i].from <= requestedScriptIndex! && inputs[i].to > requestedScriptIndex!) {
                const r = await this.generateFinalStepTaprootChunk(templates, inputs[i].from, inputs[i].to);
                results.push(r);
            } else {
                results.push({
                    hashes: array(inputs[i].to - inputs[i].from, DEAD_ROOT_HASH)
                });
            }

            const time = Date.now() - start;
            console.log(`Finished chunk ${i} of ${inputs.length}   -   ${timeStr(time)}`);
        }

        const allHashes = results.flatMap((r) => r.hashes);
        const compressor = new Compressor(allHashes.length, requestedScriptIndex);

        while (allHashes.length < compressor.total) allHashes.push(DEAD_ROOT_HASH);

        allHashes.forEach((h) => compressor.addHash(h));

        let requestedScript;
        if (refutationDescriptor) {
            requestedScript = await createRefutationScript(this.decasector, templates, refutationDescriptor);
        }
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
    const parallel = true; // !!args['parallel'];
    const ddg = new DoomsdayGenerator(agentId, setupId);
    const r = parallel ? await ddg.generateFinalStepTaprootParallel() : await ddg.generateFinalStepTaproot();
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
