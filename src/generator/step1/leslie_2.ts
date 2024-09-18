import { bufferToBigintsBE } from '../../encoding/encoding';
import { encodeWinternitz256, getWinternitzPublicKeys256 } from '../../encoding/winternitz';
import { Bitcoin } from '../step3/bitcoin';
import { proof, vKey } from './constants';
import groth16Verify, { Key, Proof as Step1_Proof } from './verifier';
import { Runner } from "./vm/runner";
import { step1_vm } from "./vm/vm";


function leslie() {

    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    // step1_vm.optimizeRegs();
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.save();
    const runner: Runner = Runner.load(program);
    runner.execute();

    function step(instruction: number, iteration: number) {

        console.log(`${iteration} ${instruction}`);

        const param1 = runner.instructions[instruction].param1;
        if (param1 && !runner.registers[param1]?.hardcoded && !runner.registers[param1]?.witness) {
            for (let i = instruction - 1; i > 0; i--) {
                if (runner.instructions[i].target == param1) {
                    step(i, iteration + 1);
                    break;
                }
            }
        }
        const param2 = runner.instructions[instruction].param2;
        if (param2 && param2 != param1 && !runner.registers[param2!]?.hardcoded && !runner.registers[param2!]?.witness) {
            for (let i = instruction - 1; i > 0; i--) {
                if (runner.instructions[i].target == param2) {
                    step(i, iteration + 1);
                    break;
                }
            }
        }
    }

    step(runner.instructions.length-1, 0);
}

leslie();
