import { Runner } from '../../src/generator/step1/vm/runner';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { InstrCode } from '../../src/generator/step1/vm/types';
import { SavedVm } from '../../src/generator/common/saved-vm';
import { getEncodingIndexForVic, ProtocolStep, transitionPatDecode, transitionPatEncode } from './common';
import { encodeLamportBit, getLamportPublicKeys } from '../../src/encoding/lamport';

const maxLineCount = 2 ** 19 - 1;
const iterations = 19;

function patPart(savedProgram: SavedVm<InstrCode>, line: number): bigint[] {

    let runner = Runner.load(savedProgram);
    let instr = runner.getInstruction(line);

    runner.execute(line - 1);
    const regsBefore = runner.getRegisterValues();
    runner.execute(line);
    const regsAfter = runner.getRegisterValues();

    const param1 = regsBefore[instr.param1];
    const param2 = regsBefore[instr.param2 ?? 0];
    const target = regsAfter[instr.target ?? 0];

    const bitcoin = new Bitcoin();

    const { witness, publicKeys } = transitionPatEncode(param1, param2, target);

    bitcoin.checkTransitionPatTransaction(witness.map(n => bitcoin.addWitness(n)), publicKeys);

    console.log('********************************************************************************')
    console.log(`Transition (PAT):`);
    console.log('data size: ', witness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    // console.log('witness: ', witnesses.flat());
    // console.log('program: ', bitcoin.programToString());

    return witness;
}

function vicPart(savedProgram: SavedVm<InstrCode>, line: number, encodedData: bigint[]): bigint[] {

    let runner = Runner.load(savedProgram);
    const instr = runner.getInstruction(line);
    runner.execute(line - 1);
    const regsBefore = runner.getRegisterValues();
    runner.execute(line);
    const regsAfter = runner.getRegisterValues();

    const [ patParam1, patParam2, patTarget ] = transitionPatDecode(encodedData);

    let detected = 3;
    if (instr.param1 && patParam1 != regsBefore[instr.param1]) {
        detected = 0;
    } else if (instr.param2 && patParam2 != regsBefore[instr.param2]) {
        detected = 1;
    } else if (instr.target && (patTarget != regsAfter[instr.target] || runner.successIndex == instr.target)) {
        detected = 2;
    }

    const bitcoin = new Bitcoin();
    const witness: bigint[] = [
        encodeLamportBit(getEncodingIndexForVic(ProtocolStep.TRANSITION, 0), detected & 1),
        encodeLamportBit(getEncodingIndexForVic(ProtocolStep.TRANSITION, 1), detected & 2)];
    bitcoin.checkTransitionVicTransaction(
        witness.map(n => bitcoin.addWitness(n)),
        [
            getLamportPublicKeys(getEncodingIndexForVic(ProtocolStep.TRANSITION, 0), 1)[0],
            getLamportPublicKeys(getEncodingIndexForVic(ProtocolStep.TRANSITION, 1), 1)[0],
        ]);

    console.log('********************************************************************************')
    console.log(`Transition (VIC):`);
    console.log('data size: ', witness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    // console.log('witness: ', witnesses.flat());
    // console.log('program: ', bitcoin.programToString());

    return witness;
}

export function transition(savedProgram: SavedVm<InstrCode>, line: number): { patEncoded: bigint[], vicEncoded: bigint[]} {

    const patEncoded = patPart(savedProgram, line);
    const vicEncoded = vicPart(savedProgram, line, patEncoded);

    return { patEncoded, vicEncoded };
}
