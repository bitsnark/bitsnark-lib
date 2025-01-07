import { FatMerkleProof } from './fat-merkle';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { DoomsdayGenerator } from '../final-step/doomsday-generator';
import { prime_bigint } from '../common/constants';
import { bigintToBufferBE, bufferToBigintBE } from '../common/encoding';
import { TemplateNames } from '../common/types';
import { createUniqueDataId } from '../setup/wots-keys';
import { Decasector, StateCommitment } from '../setup/decasector';
import { chunk } from '../common/array-utils';
import { RefutationType } from '../final-step/refutation';
import { Runner } from '../../../src/generator/ec_vm/vm/runner';

function calculateD(a: bigint, b: bigint): bigint {
    return (a * b) / prime_bigint;
}

export class Argument {
    agentId: string;
    setupId: string;
    selectionPath: number[] = [];
    selectionPathUnparsed: Buffer[][] = [];
    index: number = 0;
    proof: bigint[];

    constructor(agentId: string, setupId: string, proof: bigint[]) {
        this.agentId = agentId;
        this.setupId = setupId;
        this.proof = proof;
    }

    private makeIndexWitness(): Buffer[] {
        return [
            ...this.selectionPathUnparsed,
            encodeWinternitz24(BigInt(this.index), createUniqueDataId(this.setupId, TemplateNames.ARGUMENT, 0, 0, 6))
        ].flat();
    }

    private makeAbcdWitness(scBefore: StateCommitment, scAfter: StateCommitment, instr: Instruction): Buffer[] {
        const aValue = scBefore.getValues()[instr.param1];
        const bValue = instr.param2 ? scBefore.getValues()[instr.param2] : 0n;
        const cValue = scAfter.getValues()[instr.target];
        const dValue =
            instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD ? calculateD(aValue, bValue) : 0n;
        return [aValue, bValue, cValue, dValue]
            .map((n, dataIndex) =>
                encodeWinternitz256_4(n, createUniqueDataId(this.setupId, TemplateNames.ARGUMENT, 1, 0, dataIndex))
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

        if (valuesBefore.length != 128 || valuesAfter.length != 128)
            throw new Error('Invalid number of values in state commitment');

        const merkleProofA = await FatMerkleProof.fromRegs(valuesBefore, instr.param1);
        const merkleProofB = instr.param2 ? await FatMerkleProof.fromRegs(valuesBefore, instr.param2!) : merkleProofA;
        const merkleProofC = await FatMerkleProof.fromRegs(valuesAfter, instr.target);

        if (merkleProofA.hashes.length != 15 || merkleProofB.hashes.length != 15 || merkleProofC.hashes.length != 15)
            throw new Error('Invalid number of hashes in merkle proof');

        const hashes = [merkleProofA.toArgument(), merkleProofB.toArgument(), merkleProofC.toArgument()];
        const inputHashes = chunk(hashes.flat(), 12);
        const encoded = inputHashes.map((o, oi) =>
            o
                .map((b, dataIndex) =>
                    encodeWinternitz256_4(
                        bufferToBigintBE(b),
                        createUniqueDataId(this.setupId, TemplateNames.ARGUMENT, 2 + oi, 0, dataIndex)
                    )
                )
                .flat()
        );
        return encoded;
    }

    public async makeArgument(selectionPath: number[], selectionPathUnparsed: Buffer[][]): Promise<Buffer[][]> {
        this.selectionPath = selectionPath;
        this.selectionPathUnparsed = selectionPathUnparsed;

        const decasector = new Decasector(this.proof);
        this.index = decasector.getLineBySelectionPath(this.selectionPath);

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
        const decasector = new Decasector(this.proof);
        const tempIndex = decasector.getLineBySelectionPath(this.selectionPath);
        return tempIndex == this.index;
    }

    public async refute(
        argData: bigint[][],
        states: Buffer[][]
    ): Promise<{ data: bigint[]; script: Buffer; controlBlock: Buffer }> {
        // first input is the selection path, 6 selections and then the index
        // the selection path can't be wrong, because of the winternitz signature on it
        this.selectionPath = argData[0].slice(0, 6).map((n) => Number(n));
        this.index = Number(argData[0][6]);
        if (!this.checkIndex()) throw new Error('Invalid selection path or index');

        const decasector = new Decasector(this.proof);

        // check states
        // my state before instruction
        const runner = Runner.load(decasector.savedVm);
        runner.execute(this.index);
        const myStateBefore = await FatMerkleProof.calculateRoot(runner.getRegisterValues());
        runner.execute(this.index + 1);
        const myStateAfter = await FatMerkleProof.calculateRoot(runner.getRegisterValues());

        async function getOtherStateBtIndex(index: number): Promise<Buffer> {
            if (index >= 400000) {
                return await FatMerkleProof.calculateRoot(decasector.getRegsForSuccess());
            }
            const iter = decasector.stateCommitmentByLine[index].iteration;
            const which = decasector.stateCommitmentByLine[index].selection;
            return states[iter - 1][which];
        }
        const hisStateBefore = await getOtherStateBtIndex(this.index);
        const hisStateAfter = await getOtherStateBtIndex(this.index + 1);

        // second input is the params a, b, c, and d
        const [a, b, c, d] = argData[1];

        // let's check the instruction first
        const doomsdayGenerator = new DoomsdayGenerator(this.agentId, this.setupId);
        if (!doomsdayGenerator.checkLine(this.index, a, b, c, d)) {
            // the line is false, attack it!
            const data = [a, b, c, d];
            const { requestedScript, requestedControlBlock } = await doomsdayGenerator.generateFinalStepTaprootParallel(
                {
                    refutationType: RefutationType.INSTR,
                    line: this.index,
                    totalLines: decasector.total
                }
            );

            return { data, script: requestedScript!, controlBlock: requestedControlBlock! };
        }

        // if not the instruction, then it must be one of the hashes in the
        // merkle proofs

        const instr = decasector.savedVm.program[this.index];

        // reorder arg data for proofs
        const argProofs = chunk(argData.slice(2).flat(), 15);

        const makeProof = async (i: number) => {
            const index = i < 2 ? this.index : this.index + 1;
            const hashes = argProofs[i].map((n) => bigintToBufferBE(n, 256));
            const iter = decasector.stateCommitmentByLine[index].iteration;
            const which = decasector.stateCommitmentByLine[index].selection;
            const root = states[iter - 1][which];
            const leaf = bigintToBufferBE([a, b, c, d][i], 256);
            return await FatMerkleProof.fromArgument(hashes, leaf, root, index);
        };

        const merkleProofA = await makeProof(0);
        const merkleProofB = instr.param2 ? await makeProof(1) : merkleProofA;
        const merkleProofC = await makeProof(2);
        const proofs = [merkleProofA, merkleProofB, merkleProofC];
        let whichProof = -1;
        for (let i = 0; i < proofs.length; i++) {
            if (!(await proofs[i].verify())) {
                whichProof = i;
                break;
            }
        }
        // this should never happen
        if (whichProof < 0) {
            throw new Error('All merkle proofs check out!');
        }
        const whichHash = await proofs[whichProof].indexToRefute();
        const data = [...proofs[whichProof].hashes.slice(whichHash * 2, whichHash * 2 + 3)].map((b) =>
            bufferToBigintBE(b)
        );
        const { requestedScript, requestedControlBlock } = await doomsdayGenerator.generateFinalStepTaprootParallel({
            refutationType: RefutationType.HASH,
            line: this.index,
            whichProof,
            whichHash: Math.floor(whichHash / 2),
            totalLines: decasector.total
        });
        // return { data, script: script!, controlBlock: controlBlock! };
        return { data, script: requestedScript!, controlBlock: requestedControlBlock! };
    }
}
