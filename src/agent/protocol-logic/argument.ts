import assert from 'node:assert';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import { FatMerkleProof } from './fat-merkle';
import { bufferToBigintBE, encodeWinternitz24, encodeWinternitz256_4 } from '../winternitz';
import { createUniqueDataId } from '../transactions-new';
import { TransactionNames } from '../common';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';
import { prime_bigint } from '../final-step/verify-mulmod';
import { Decasector, StateCommitment } from './decasector';

function calculateD(a: bigint, b: bigint): bigint {
    return (a * b) / prime_bigint;
}

function makeIndexWitness(
    setupId: string,
    selectionPathUnparsed: Buffer[][],
    index: number,
    outputIndex: number
): Buffer[] {
    return [
        ...selectionPathUnparsed,
        encodeWinternitz24(
            BigInt(index),
            createUniqueDataId(setupId, TransactionNames.ARGUMENT, outputIndex, 0, selectionPathUnparsed.length)
        )
    ].flat();
}

function makeAbcdWitness(
    setupId: string,
    scBefore: StateCommitment,
    scAfter: StateCommitment,
    instr: Instruction,
    outputIndex: number
): Buffer[] {
    const aValue = scBefore.getValueForRuntimeIndex(instr.param1);
    const bValue = instr.param2 ? scBefore.getValueForRuntimeIndex(instr.param2) : 0n;
    const cValue = scAfter.getValueForRuntimeIndex(instr.target);
    const dValue = instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD ? calculateD(aValue, bValue) : 0n;
    return [aValue, bValue, cValue, dValue].map((n, dataIndex) =>
        encodeWinternitz256_4(n, createUniqueDataId(setupId, TransactionNames.ARGUMENT, outputIndex, 0, dataIndex))
    ).flat();
}

async function makeMerkleProofsWitness(
    setupId: string,
    scBefore: StateCommitment,
    scAfter: StateCommitment,
    instr: Instruction,
    outputIndex: number
): Promise<Buffer[][]> {

    const valuesBefore = scBefore.getValues();
    const valuesAfter = scAfter.getValues();
    const merkleProofA = await FatMerkleProof.fromRegs(valuesBefore, scBefore.getIndexForRuntimeIndex(instr.param1));
    const merkleProofB = instr.param2 ?
        await FatMerkleProof.fromRegs(valuesBefore, scBefore.getIndexForRuntimeIndex(instr.param2!)) :
        merkleProofA;
    const merkleProofC = await FatMerkleProof.fromRegs(valuesAfter, scAfter.getIndexForRuntimeIndex(instr.target));

    const hashes = [merkleProofA.toArgument(), merkleProofB.toArgument(), merkleProofC.toArgument()];
    const encoded = hashes.map((o, oi) =>
        o.map((b, dataIndex) => encodeWinternitz256_4(
            bufferToBigintBE(b),
            createUniqueDataId(setupId, TransactionNames.ARGUMENT, outputIndex + oi, 0, dataIndex)
        )).flat()
    );
    return encoded;
}

export async function makeArgument(
    setupId: string,
    proof: bigint[],
    selectionPath: number[],
    selectionPathUnparsed: Buffer[][]
): Promise<Buffer[][]> {
    let index = 0;
    for (const s of selectionPath) {
        index = index * 10 + s;
    }
    const decasector = new Decasector(proof);
    const scBefore = decasector.stateCommitmentByLine[index - 1];
    const scAfter = decasector.stateCommitmentByLine[index];
    const instr = decasector.savedVm.program[index];
    const outputs: Buffer[][] = [
        makeIndexWitness(setupId, selectionPathUnparsed, index, 0),
        makeAbcdWitness(setupId, scBefore, scAfter, instr, 1),
        ...(await makeMerkleProofsWitness(setupId, scBefore, scAfter, instr, 2))
    ];
    return outputs;
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
