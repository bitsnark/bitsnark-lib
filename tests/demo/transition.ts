import fs from 'fs';
import groth16Verify, { Key, Proof } from '../../src/generator/step1/verifier';
import { proof, publicSignals } from './proof';
import { step1_vm } from '../../src/generator/step1/vm/vm';
import { Runner } from '../../src/generator/step1/vm/runner';
import { merkelize } from './merkle';
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






    let chunkIndex = 20;
    let right = runner.instructions.length - 1;
    let left = 0;
    let lamportKeyIndex = 0;
    const states: bigint[] = [];
    let iterations = 0;

    while (true) {

        let middle;
        if (right - left <= 1) middle = right;
        else middle = Math.floor((right + left) / 2);

        console.log('******************************************************************************************')
        console.log('iter: ', iterations++, '    left ', left, '   middle ', middle, '   right ', right);

        // PAT part
        {
            runner = Runner.load(saved);
            runner.execute(middle);
            let merkleRoot = merkelize(runner.getRegisterValues());

            // insert error in states after line 10000
            if (middle >= 10000) merkleRoot++;

            states[middle] = merkleRoot;
            const bitcoin = new Bitcoin();
            const witness = bufferToBigints256(encodeWinternitz(merkleRoot, chunkIndex, 256, 12));
            bitcoin.winternitzCheck256(
                witness.map(n => bitcoin.addWitness(n)), 
                winternitzKeys.slice(chunkIndex * 90, chunkIndex * 90 + 90).map(k => k.pblc));

            console.log('PAT:');
            console.log('witness: ', witness);
            console.log('program: ', bitcoin.programToString());
        }

        // VIC part
        {
            runner = Runner.load(saved);
            runner.execute(middle);
            const midState = merkelize(runner.getRegisterValues());
            runner.execute(right);
            const rightState = merkelize(runner.getRegisterValues());

            let witness: bigint[];
            const bitcoin = new Bitcoin();
            let bit = 0;
            if (midState != states[middle]) {
                bit = 0;
                right = middle;
            } else if (rightState != states[right]) {
                bit = 1;
                left = middle;
            } else {
                throw new Error('States agree');
            }
                
            witness = bufferToBigints256(encodeLamportBits(BigInt(bit), 1));
            bitcoin.lamportDecodeBit(
                bitcoin.newStackItem(0n),
                bitcoin.addWitness(witness[0]),
                [ lamportKeys[lamportKeyIndex++][0].pblc, lamportKeys[lamportKeyIndex++][1].pblc ]
            );

            console.log('VIC:');
            console.log('witness: ', witness);
            console.log('program: ', bitcoin.programToString());
        }

        if (right - left <= 1) {
            console.log('Found instruction, line: ', middle);
            return;
        }
    }
}

step1();
