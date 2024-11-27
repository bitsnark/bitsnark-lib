import assert from 'node:assert';
import { FatMerkleProof } from './fat-merkle';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { createUniqueDataId, Transaction } from '../common/transactions';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { Decasector, StateCommitment } from './decasector';
import { DoomsdayGenerator, RefutationType } from '../final-step/doomsday-generator';
import { prime_bigint } from '../common/constants';
import { bigintToBufferBE, bufferToBigintBE } from '../common/encoding';
import { TransactionNames } from '../common/types';

function calculateD(a: bigint, b: bigint): bigint {
    return (a * b) / prime_bigint;
}

export class Argument {
    setupId: string;
    selectionPath: number[] = [];
    selectionPathUnparsed: Buffer[][] = [];
    index: number = 0;
    proof: bigint[];

    constructor(setupId: string, proof: bigint[]) {
        this.setupId = setupId;
        this.proof = proof;
    }

    private makeIndexWitness(outputIndex: number): Buffer[] {
        return [
            ...this.selectionPathUnparsed,
            encodeWinternitz24(
                BigInt(this.index),
                createUniqueDataId(
                    this.setupId,
                    TransactionNames.ARGUMENT,
                    outputIndex,
                    0,
                    this.selectionPathUnparsed.length
                )
            )
        ].flat();
    }

    private makeAbcdWitness(
        scBefore: StateCommitment,
        scAfter: StateCommitment,
        instr: Instruction,
        outputIndex: number
    ): Buffer[] {
        const aValue = scBefore.getValueForRuntimeIndex(instr.param1);
        const bValue = instr.param2 ? scBefore.getValueForRuntimeIndex(instr.param2) : 0n;
        const cValue = scAfter.getValueForRuntimeIndex(instr.target);
        const dValue =
            instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD ? calculateD(aValue, bValue) : 0n;
        return [aValue, bValue, cValue, dValue]
            .map((n, dataIndex) =>
                encodeWinternitz256_4(
                    n,
                    createUniqueDataId(this.setupId, TransactionNames.ARGUMENT, outputIndex, 0, dataIndex)
                )
            )
            .flat();
    }

    private async makeMerkleProofsWitness(
        scBefore: StateCommitment,
        scAfter: StateCommitment,
        instr: Instruction,
        outputIndex: number
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
                        createUniqueDataId(this.setupId, TransactionNames.ARGUMENT, outputIndex + oi, 0, dataIndex)
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
            this.makeIndexWitness(0),
            this.makeAbcdWitness(scBefore, scAfter, instr, 1),
            ...(await this.makeMerkleProofsWitness(scBefore, scAfter, instr, 2))
        ];
        return outputs;
    }

    public async refute(
        transactions: Transaction[],
        argData: bigint[][]
    ): Promise<{ data: bigint[]; script: Buffer; controlBlock: Buffer }> {
        // first input is the selection path, 6 selections and then the index
        // the selection path can't be wrong, becaue of the winternitz signature on it
        this.selectionPath = argData[0].slice(0, 6).map((n) => Number(n));
        this.index = Number(argData[6]);

        // lets make sure it's correct for sanity sake
        let tempIndex = 0;
        for (const selection of this.selectionPath) {
            tempIndex = tempIndex * 10 + selection;
        }
        if (tempIndex != this.index) {
            // This should never happen!
            throw new Error('Selection path error.');
        }

        // second input is the params a, b, c, and d
        const [a, b, c, d] = argData[1];

        // let's check the instruction first
        const doomsdayGenerator = new DoomsdayGenerator();
        if (!doomsdayGenerator.checkLine(this.index, a, b, c, d)) {
            // the line is false, attack it!
            const data = [a, b, c, d];
            const { script, controlBlock } = await doomsdayGenerator.generateFinalStepTaproot(transactions, {
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
        const merkleProofA = await FatMerkleProof.fromArgument(
            argData[2].map((n) => bigintToBufferBE(n, 256)),
            this.index
        );
        const merkleProofB = instr.param2
            ? await FatMerkleProof.fromArgument(
                  argData[3].map((n) => bigintToBufferBE(n, 256)),
                  this.index
              )
            : merkleProofA;
        const merkleProofC = await FatMerkleProof.fromArgument(
            argData[4].map((n) => bigintToBufferBE(n, 256)),
            this.index
        );
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
        const { script, controlBlock } = await doomsdayGenerator.generateFinalStepTaproot(transactions, {
            refutationType: RefutationType.HASH,
            line: this.index,
            whichProof,
            whichHash
        });

        return { data, script: script!, controlBlock: controlBlock! };
    }
}

async function testFatMerkleProof() {
    // get actual registers from the middle of the program
    const decasector = new Decasector();

    // make fat merkle proof
    const mp = await FatMerkleProof.fromRegs(decasector.stateCommitmentByLine[150000].getValues(), 32);

    const r = await mp.verify();
    assert(r);
}

async function main() {
    await testFatMerkleProof();
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main().catch(console.error);
}
