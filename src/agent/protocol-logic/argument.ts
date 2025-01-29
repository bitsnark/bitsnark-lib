import { FatMerkleProof } from './fat-merkle';
import { encodeWinternitz24, encodeWinternitz256_4 } from '../common/winternitz';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { DoomsdayGenerator } from '../final-step/doomsday-generator';
import { prime_bigint } from '../common/constants';
import { bufferToBigintBE } from '../common/encoding';
import { TemplateNames, WitnessAndValue } from '../common/types';
import { createUniqueDataId } from '../setup/wots-keys';
import { Decasector, StateCommitment } from '../setup/decasector';
import { chunk } from '../common/array-utils';
import { RefutationType } from '../final-step/refutation';

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
}

async function refuteInstruction(
    doomsdayGenerator: DoomsdayGenerator,
    index: WitnessAndValue,
    params: WitnessAndValue[]
): Promise<{ data: WitnessAndValue[]; script: Buffer; controlBlock: Buffer }> {
    const { requestedScript, requestedControlBlock } = await doomsdayGenerator.generateFinalStepTaprootParallel({
        refutationType: RefutationType.INSTR,
        line: Number(index.value)
    });
    return {
        data: [index, ...params],
        script: requestedScript!,
        controlBlock: requestedControlBlock!
    };
}

async function refuteHash(
    doomsdayGenerator: DoomsdayGenerator,
    decasector: Decasector,
    index: WitnessAndValue,
    argData: WitnessAndValue[][],
    states: WitnessAndValue[][]
) {
    const instr = decasector.savedVm.program[Number(index.value)];

    // reorder arg data for proofs
    const argProofs = chunk(argData.slice(2).flat(), 13);
    const params = argData[1];

    const makeProof = async (i: number): Promise<FatMerkleProof> => {
        const line = i < 2 ? Number(index.value) : Number(index.value) + 1;
        const hashes = argProofs[i];
        const iter = decasector.stateCommitmentByLine[line].iteration;
        const which = decasector.stateCommitmentByLine[line].selection;
        const root = states[iter - 1][which];
        const leaf = params[i];
        return await FatMerkleProof.fromArgument(hashes, leaf, root, line);
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
    if (whichHash < 0) throw new Error("Can't find bad hash");
    const data = [...proofs[whichProof].hashes.slice(whichHash, whichHash + 3)];
    const { requestedScript, requestedControlBlock } = await doomsdayGenerator.generateFinalStepTaprootParallel({
        refutationType: RefutationType.HASH,
        line: Number(index.value),
        whichProof,
        whichHashOption: Math.floor(whichHash / 2)
    });

    return { data, script: requestedScript!, controlBlock: requestedControlBlock! };
}

export async function refute(
    agentId: string,
    setupId: string,
    proof: bigint[],
    argData: WitnessAndValue[][],
    states: WitnessAndValue[][]
): Promise<{ data: WitnessAndValue[]; script: Buffer; controlBlock: Buffer }> {
    // first input is the selection path, 6 selections and then the index
    // the selection path can't be wrong, because of the winternitz signature on it
    const selectionPath = argData[0].slice(0, 6);
    const index = argData[0][6];
    const decasector = new Decasector(proof);
    const tempIndex = decasector.getLineBySelectionPath(selectionPath.map((wav) => Number(wav.value)));
    if (tempIndex != Number(index.value)) {
        throw new Error('Invalid selection path or index');
    }

    const doomsdayGenerator = new DoomsdayGenerator(agentId, setupId);

    // second input is the params a, b, c, and d
    const params = argData[1];
    const [a, b, c] = params;
    // let's check the instruction first
    if (!doomsdayGenerator.checkLine(Number(index.value), a.value as bigint, b.value as bigint, c.value as bigint)) {
        // the line is false, attack it!
        return refuteInstruction(doomsdayGenerator, index, params);
    }

    // if not the instruction, then it must be one of the hashes in the
    // merkle proofs

    return refuteHash(doomsdayGenerator, decasector, index, argData, states);
}
