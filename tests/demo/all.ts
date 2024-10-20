import fs from 'fs';
import { createChallengeTx } from "./challenge";
import { createInitialTx } from "./initial";
import groth16Verify, { Key, Proof } from '../../src/generator/step1/verifier';
import { proof, publicSignals } from './proof';
import { step1_vm } from '../../src/generator/step1/vm/vm';
import { SavedVm } from '../../src/generator/common/saved-vm';
import { InstrCode as Step1_InstrCode } from '../../src/generator/step1/vm/types';
import { InstrCode as Step2_InstrCode } from '../../src/generator/step2/vm/types';
import { getEncodingIndexForVic, initialPatDecode, ProtocolStep, transitionPatDecode } from './common';
import { step1 } from './step1';
import { step2_vm } from '../../src/generator/step2/vm/vm';
import { validateInstr } from '../../src/generator/step2/final-step';
import { Runner as Step1Runner } from '../../src/generator/step1/vm/runner';
import { transition } from './transition';
import { decodeLamportBit } from '../../src/encoding/lamport';
import { Runner as Step2Runner } from '../../src/generator/step2/vm/runner';
import { step2 } from './step2';
import { finalStep } from './final-step';

function searchPathToNumber(searchPath: number[]): number {
    let n = 0;
    for (let i = 0; i < searchPath.length; i++) {
        n = n << 1;
        n += searchPath[i];
    }
    return n;
}

function getSavedStep1(): SavedVm<Step1_InstrCode> {
    const vkey_path = './tests/step1/groth16/verification_key.json';
    const vKey = JSON.parse(fs.readFileSync(vkey_path).toString());
    groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, publicSignals));
    if (!step1_vm.success) throw new Error('Failed');
    step1_vm.optimizeRegs();
    return step1_vm.save();
}

function getSavedStep2(a: bigint, b: bigint, c: bigint, code: Step1_InstrCode, bit?: number): SavedVm<Step2_InstrCode> {
    validateInstr(a, b, c, code, bit);
    return step2_vm.save();
}

export function all() {

    const encodedProof = createInitialTx();

    const step1SavedVm = getSavedStep1();
    const proof = initialPatDecode(encodedProof);

    const temp = proof.map(n => n.toString(16));
    step1SavedVm.witness = temp;

    /***   break the proof!   */
    step1SavedVm.witness[0] = (BigInt('0x' + step1SavedVm.witness[0]) + 1n).toString(16);

    if (!createChallengeTx(step1SavedVm, encodedProof)) return;
    const searchPath = step1(step1SavedVm);
    const step1_lineNumber = searchPathToNumber(searchPath);

    const { patEncoded: encodedRegisters, vicEncoded: encodedSelection } = transition(step1SavedVm, step1_lineNumber);
    const selection = decodeLamportBit(encodedSelection[0], getEncodingIndexForVic(ProtocolStep.TRANSITION, 0)) +
        decodeLamportBit(encodedSelection[1], getEncodingIndexForVic(ProtocolStep.TRANSITION, 1)) * 2;

    if (selection != 2) throw new Error('Not implemented');

    const step1runner = Step1Runner.load(step1SavedVm);
    const instr = step1runner.getInstruction(step1_lineNumber);
    const [ a, b, c ] = transitionPatDecode(encodedRegisters);

    const step2Saved = getSavedStep2(a, b, c, instr.name, instr.bit);
    const step2runner = Step2Runner.load(step2Saved);

    const step2SearchPath = step2(step2Saved);
    const step2_lineNumber = searchPathToNumber(step2SearchPath);

    step2runner.execute(step2_lineNumber - 1);
    const regsBefore = step2runner.getRegisterValuesNoHardcoded();
    step2runner.execute(step2_lineNumber);
    const regsAfter = step2runner.getRegisterValuesNoHardcoded();
    const step2Instr = step2runner.getInstruction(step2_lineNumber);

    finalStep(
        step1_lineNumber, selection, step2_lineNumber,
        step2Instr.param1 ?? 0, step2Instr.param2 ?? 0, step2Instr.target,
        regsBefore[step2Instr.param1 ?? 0], regsBefore[step2Instr.param2 ?? 0], regsAfter[step2Instr.target],
        step2Instr.name);
}

all();
