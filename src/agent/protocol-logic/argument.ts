import { FatMerkleProof } from './fat-merkle';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { Decasector, StateCommitment } from './decasector';
import { DoomsdayGenerator, RefutationType } from '../final-step/doomsday-generator';
import { prime_bigint } from '../common/constants';
import { bigintToBufferBE, bufferToBigintBE } from '../common/encoding';
import { Template, TemplateNames } from '../common/types';
import { createUniqueDataId } from '../setup/wots-keys';

function calculateD(a: bigint, b: bigint): bigint {
    return (a * b) / prime_bigint;
}

export class Argument {
    wotsSalt: string;
    selectionPath: number[] = [];
    selectionPathUnparsed: Buffer[][] = [];
    index: number = 0;
    proof: bigint[];

    constructor(wotsSalt: string, proof: bigint[]) {
        this.wotsSalt = wotsSalt;
        this.proof = proof;
    }

    private makeIndexWitness(): Buffer[] {
        return [
            ...this.selectionPathUnparsed,
            encodeWinternitz24(
                BigInt(this.index),
                createUniqueDataId(this.wotsSalt, TemplateNames.ARGUMENT, 0, 0, 6)
            )
        ].flat();
    }

    private makeAbcdWitness(scBefore: StateCommitment, scAfter: StateCommitment, instr: Instruction): Buffer[] {
        const aValue = scBefore.getValueForRuntimeIndex(instr.param1);
        const bValue = instr.param2 ? scBefore.getValueForRuntimeIndex(instr.param2) : 0n;
        const cValue = scAfter.getValueForRuntimeIndex(instr.target);
        const dValue =
            instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD ? calculateD(aValue, bValue) : 0n;
        return [aValue, bValue, cValue, dValue]
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.wotsSalt, TemplateNames.ARGUMENT, 1, 0, dataIndex))
            )
            .flat();
    }

    private async makeMerkleProofsWitness(
        scBefore: StateCommitment,
        scAfter: StateCommitment,
        instr: Instruction
    ): Promise<Buffer[][]> {
        const valuesBefore = scBefore.getValues();
        const valuesAfter = scAfter.getValues();
        const merkleProofA = await FatMerkleProof.fromRegs(
            valuesBefore,
            scBefore.getIndexForRuntimeIndex(instr.param1)
        );
        const merkleProofB = instr.param2
            ? await FatMerkleProof.fromRegs(valuesBefore, scBefore.getIndexForRuntimeIndex(instr.param2!))
            : merkleProofA;
        const merkleProofC = await FatMerkleProof.fromRegs(valuesAfter, scAfter.getIndexForRuntimeIndex(instr.target));

        const hashes = [merkleProofA.toArgument(), merkleProofB.toArgument(), merkleProofC.toArgument()];
        const encoded = hashes.map((o, oi) =>
            o
                .map((b, dataIndex) =>
                    encodeWinternitz256_4(
                        bufferToBigintBE(b),
                        createUniqueDataId(this.wotsSalt, TemplateNames.ARGUMENT, 2 + oi, 0, dataIndex)
                    )
                )
                .flat()
        );
        return encoded;
    }

    public async makeArgument(selectionPath: number[], selectionPathUnparsed: Buffer[][]): Promise<Buffer[][]> {
        this.selectionPath = selectionPath;
        this.selectionPathUnparsed = selectionPathUnparsed;

        this.index = 0;
        for (const s of this.selectionPath) {
            this.index = this.index * 10 + s;
        }
        const decasector = new Decasector(this.proof);
        const scBefore = decasector.stateCommitmentByLine[this.index - 1];
        const scAfter = decasector.stateCommitmentByLine[this.index];
        const instr = decasector.savedVm.program[this.index];
        const outputs: Buffer[][] = [
            this.makeIndexWitness(),
            this.makeAbcdWitness(scBefore, scAfter, instr),
            ...(await this.makeMerkleProofsWitness(scBefore, scAfter, instr))
        ];
        return outputs;
    }

    public checkIndex() {
        // lets make sure it's correct for sanity sake
        let tempIndex = 0;
        for (const selection of this.selectionPath) {
            tempIndex = tempIndex * 10 + selection;
        }
        return tempIndex == this.index;
    }

    public async refute(
        templates: Template[],
        argData: bigint[][],
        states: Buffer[][]
    ): Promise<{ data: bigint[]; script: Buffer; controlBlock: Buffer }> {
        // first input is the selection path, 6 selections and then the index
        // the selection path can't be wrong, becaue of the winternitz signature on it
        this.selectionPath = argData[0].slice(0, 6).map((n) => Number(n));
        this.index = Number(argData[6]);

        if (!this.checkIndex()) throw new Error('Invalid selection path or index');

        // second input is the params a, b, c, and d
        const [a, b, c, d] = argData[1];

        // let's check the instruction first
        const doomsdayGenerator = new DoomsdayGenerator();
        if (!doomsdayGenerator.checkLine(this.index, a, b, c, d)) {
            // the line is false, attack it!
            const data = [a, b, c, d];
            const { script, controlBlock } = await doomsdayGenerator.generateFinalStepTaproot(templates, {
                refutationType: RefutationType.INSTR,
                line: this.index
            });

            return { data, script: script!, controlBlock: controlBlock! };
        }

        // if not the instruction, then it must be one of the hashes in the
        // merkle proofs

        // 3 merkle proofs are in input 2, 3, and 4
        const decasector = new Decasector(this.proof);
        const instr = decasector.savedVm.program[this.index];

        const makeProof = async (i: number) => {
            const hashes = argData[2 + i].map((n) => bigintToBufferBE(n, 256));
            const iter = decasector.stateCommitmentByLine[this.index].iteration;
            const which = decasector.stateCommitmentByLine[this.index].selection;
            const root = states[iter][which];
            const leaf = bigintToBufferBE([a, b, c, d][i], 256);
            return await FatMerkleProof.fromArgument(hashes, leaf, root, this.index);
        };

        const merkleProofA = await makeProof(0);
        const merkleProofB = instr.param2 ? await makeProof(1) : merkleProofA;
        const merkleProofC = await makeProof(2);
        const proofs = [merkleProofA, merkleProofB, merkleProofC];
        const whichProof = proofs.findIndex((p) => !p.verify());
        if (whichProof < 0) {
            // this should never happen
            throw new Error('All merkle proofs check out!');
        }
        const whichHash = await proofs[whichProof].indexToRefute();
        const data = [...proofs[whichProof].hashes.slice(whichHash * 2, whichHash * 2 + 3)].map((b) =>
            bufferToBigintBE(b)
        );
        const { script, controlBlock } = await doomsdayGenerator.generateFinalStepTaproot(templates, {
            refutationType: RefutationType.HASH,
            line: this.index,
            whichProof,
            whichHash
        });

        return { data, script: script!, controlBlock: controlBlock! };
    }
}
