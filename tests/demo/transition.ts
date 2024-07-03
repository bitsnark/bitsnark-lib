import fs from 'fs';
import groth16Verify, { Key, Proof } from '../../src/generator/step1/verifier';
import { proof, publicSignals } from './proof';
import { step1_vm } from '../../src/generator/step1/vm/vm';
import { Runner } from '../../src/generator/step1/vm/runner';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { bufferToBigints256, encodeLamportBits, encodeWinternitz, lamportKeys, winternitzKeys } from '../encoding';

const vkey_path = './tests/step1/groth16/verification_key.json';

function transition() {

    const vKey = JSON.parse(fs.readFileSync(vkey_path).toString());
    groth16Verify(Key.fromSnarkjs(vKey), Proof.fromSnarkjs(proof, publicSignals));
    step1_vm.optimizeRegs();
    const saved = step1_vm.save();

    const contentionLine = 10000;

    // Pat

    let runner = Runner.load(saved);
    const instr = runner.instructions[contentionLine];
    runner.execute(contentionLine - 1);
    const regsBefore = runner.getRegisterValues();
    runner.execute(contentionLine);
    const regsAfter = runner.getRegisterValues();

    const param1 = regsBefore[instr.param1];
    const param2 = regsBefore[instr.param2 ?? 0];
    const target = regsBefore[instr.target ?? 0];

    // PAT part
    {
        const bitcoin = new Bitcoin();

        const chunkIndex = 32;
        const witnesses: bigint[][] = [];

        [param1, param2, target].forEach((n, i) => {
            const witness = bufferToBigints256(encodeWinternitz(n, chunkIndex + i, 256, 12));
            witnesses.push(witness);
        });

        [param1, param2, target].forEach((n, i) => {
            const witness = witnesses[i];
            bitcoin.winternitzCheck256(
                witness.map(n => bitcoin.addWitness(n)),
                winternitzKeys.slice((chunkIndex + i) * 90, (chunkIndex + i) * 90 + 90).map(k => k.pblc));
        });

        console.log('PAT:');
        console.log('data size: ', witnesses.flat().length * 32);
        console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
        console.log('max stack size: ', bitcoin.maxStack);
        console.log('witness: ', witnesses.flat());
        console.log('program: ', bitcoin.programToString());
    }

    // VIC part
    {
        const bitcoin = new Bitcoin();

        const chunkIndex = 32;
        const witness = bufferToBigints256(encodeWinternitz(4n, chunkIndex, 32, 9));
        bitcoin.winternitzCheck256(
            witness.map(n => bitcoin.addWitness(n)),
            winternitzKeys.slice(chunkIndex * 90, chunkIndex * 90 + 90).map(k => k.pblc));

        console.log('VIC:');
        console.log('data size: ', witness.length * 32);
        console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
        console.log('max stack size: ', bitcoin.maxStack);
        console.log('witness: ', witness);
        console.log('program: ', bitcoin.programToString());
    }
}

transition();
