import { Instruction } from '../../generator/ec_vm/vm/types';
import { Compressor } from '../common/taptree';
import { Template } from '../common/types';
import { AgentDb } from '../common/agent-db';
import { ForkCommand, ForkYourself } from '../fork/fork-yourself';
import { GenerateFinalTaprootCommand } from '../fork/fork-entrypoint';
import { parallelize } from '../common/parallelize';
import { array, range } from '../common/array-utils';
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

function timeStr(ms: number): string {
    ms /= 1000;
    let h, m, s;
    h = `${Math.round(ms / 3600)}h`;
    ms %= 3600; // remove hours
    m = `${Math.round(ms / 60)}m`;
    ms %= 60; // remove minutes
    s = `${Math.round(ms)}s`;
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
        const total = getMaxRefutationIndex(this.decasector);
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
                const script = await createRefutationScript(
                    this.decasector,
                    templates,
                    getRefutationDescriptor(this.decasector, i)
                );
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
        const start = Date.now();
        console.log('Starting doomsday parallel...');
        const inputs = this.chunkTheWork(16);
        const requestedScriptIndex = refutationDescriptor ? getRefutationIndex(refutationDescriptor) : undefined;

        const results = await parallelize<GenerateFinalTaprootCommand, ChunkResult>(inputs, (input) =>
            this.forker.fork(input)
        );
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

    async generateFinalStepTaproot(refutationDescriptor?: RefutationDescriptor): Promise<GenerateTaprootResult> {
        const db = new AgentDb(this.agentId);
        const templates = await db.getTemplates(this.setupId);
        const inputs = this.chunkTheWork(100);
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
    const r = parallel ? await ddg.generateFinalStepTaprootParallel() : await ddg.generateFinalStepTaproot();
    console.log(r);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
