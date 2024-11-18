import groth16Verify, { Key, Proof as Step1_Proof } from '../../generator/ec_vm/verifier';
import { step1_vm } from '../../generator/ec_vm/vm/vm';
import { vKey } from '../../generator/ec_vm/constants';
import { FatMerkleProof } from './fat-merkle';
import { Runner } from '../../generator/ec_vm/vm/runner';
import { bufferToBigintBE, encodeWinternitz24, encodeWinternitz256_4 } from '../winternitz';
import { createUniqueDataId } from '../transactions-new';
import { TransactionNames } from '../common';
import { InstrCode, Instruction } from '../../generator/ec_vm/vm/types';

function calculateD(a: bigint, b: bigint, c: bigint): bigint {
    return 0n;
}

function chunk<T>(a: T[], n: number): T[][] {
    const r: T[][] = [];
    while (a.length > 0) {
        const c = a.slice(0, n);
        r.push(c);
        a = a.slice(n);
    }
    return r;
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
    beforeRegs: bigint[],
    afterRegs: bigint[],
    instr: Instruction,
    outputIndex: number
): Buffer[] {
    const aValue = beforeRegs[instr.param1];
    const bValue = beforeRegs[instr.param2!];
    const cValue = afterRegs[instr.target];
    const dValue =
        instr.name == InstrCode.MULMOD || instr.name == InstrCode.DIVMOD ? calculateD(aValue, bValue, cValue) : 0n;

    return [aValue, bValue, cValue, dValue]
        .map((n, dataIndex) =>
            encodeWinternitz256_4(n, createUniqueDataId(setupId, TransactionNames.ARGUMENT, outputIndex, 0, dataIndex))
        )
        .flat();
}

async function makeMerkleProofsWitness(
    setupId: string,
    beforeRegs: bigint[],
    afterRegs: bigint[],
    instr: Instruction,
    outputIndex: number
): Promise<Buffer[][]> {
    const merkleProofA = await FatMerkleProof.fromRegs(beforeRegs, instr.param1);
    const merkleProofB = await FatMerkleProof.fromRegs(beforeRegs, instr.param2!);
    const merkleProofC = await FatMerkleProof.fromRegs(afterRegs, instr.target);

    const hashes = [merkleProofA.hashes, merkleProofB.hashes, merkleProofC.hashes];
    const encoded = hashes.map((o, oi) =>
        o
            .map((b, dataIndex) =>
                encodeWinternitz256_4(
                    bufferToBigintBE(b),
                    createUniqueDataId(setupId, TransactionNames.ARGUMENT, outputIndex + oi, 0, dataIndex)
                )
            )
            .flat()
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

    step1_vm.reset();
    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.instructions;
    const instr = program[index];
    const runner = Runner.load(step1_vm.save());
    runner.execute(index - 1);
    const beforeRegs = runner.getRegisterValues();
    runner.execute(index);
    const afterRegs = runner.getRegisterValues();

    const outputs: Buffer[][] = [
        makeIndexWitness(setupId, selectionPathUnparsed, index, 0),
        makeAbcdWitness(setupId, beforeRegs, afterRegs, instr, 1),
        ...(await makeMerkleProofsWitness(setupId, beforeRegs, afterRegs, instr, 2))
    ];
    return outputs;
}
