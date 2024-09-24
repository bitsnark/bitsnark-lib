import { proof, vKey } from './constants';
import groth16Verify, { Key, Proof as Step1_Proof } from './verifier';
import { Runner } from "./vm/runner";
import { step1_vm } from "./vm/vm";

function regsAt(runner: Runner, left: number, right: number, point: number): number[] {

    const map: any = {};
    for (let i = left; i <= point; i++) {
        if (!runner.instructions[i]) break;
        const index = runner.instructions[i].target;
        map[index] = true;
    }
    const regs: number[] = [];
    for (let i = point + 1; i <= right; i++) {
        if (runner.instructions[i]?.param1 && map[runner.instructions[i]?.param1]) {
            regs.push(runner.instructions[i].param1);
            delete map[runner.instructions[i].param1];
        }
        if (runner.instructions[i]?.param2 && map[runner.instructions[i]?.param2]) {
            regs.push(runner.instructions[i].param2!);
            delete map[runner.instructions[i].param2!];
        }
    }
    return regs;
}

function leslie() {

    groth16Verify(Key.fromSnarkjs(vKey), Step1_Proof.fromSnarkjs(proof));
    // step1_vm.optimizeRegs();
    if (!step1_vm.success?.value) throw new Error('Failed.');
    const program = step1_vm.save();
    const runner: Runner = Runner.load(program);
    runner.execute();

    // let min = 1000000;
    // for (let i=0; i<runner.instructions.length; i++) {
    //     const regs = regsAt(runner, 0, runner.instructions.length, i);
    //     //console.log(`${i} ${regs.length}`);
    //     if (regs.length < min) min = regs.length;
    //     if (i % 1000 == 0) console.log(i, '   ', min);
    // }
    // console.log('min', min);

    function getMax(left: number, right: number, foo: number[], iteration: number) {

        // const middle = Math.round(left + (right - left) * Math.random());
        const middle = Math.round((left + right) / 2);

        if (middle == left || middle == right) return;

        const regsAt1 = regsAt(runner, left, right, middle).length;
        foo[iteration] = Math.max(foo[iteration], regsAt1);
        // console.log(`${foo.iteration}     ${left} ${middle} ${right} \t\t\t ${regsAt1}`);

        // if (iteration > 19) return;

        getMax(left, middle, foo, iteration + 1);
        getMax(middle, right, foo, iteration + 1);

        return;
    }

    const foo = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    getMax(0, runner.instructions.length-1, foo, 0);
    console.log(foo);


    // let min = 1000;
    // let minIter = 1000;
    // let minFoo = null;
    // for (let i = 0; i < 1000000; i++) {
    //     const foo = getMax(0, runner.instructions.length - 1, { max: 0, iteration: 0 });
    //     console.log('foo', foo, '   minFoo', minFoo);
    //     if (foo.max < min || (foo.max == min && foo.iteration < minIter)) {
    //         min = foo.max;
    //         minIter = foo.iteration;
    //         minFoo = foo;
    //     }
    // }

    // console.log('min', min, 'foo', minFoo);
}

leslie();

// const bitcoin = new Bitcoin();
// const buf = encodeWinternitz256(3n, 0);
// const witness = bufferToBigintsBE(buf, 32).map(n => bitcoin.addWitness(n));
// bitcoin.winternitzCheck256(witness, getWinternitzPublicKeys256(0));
// console.log(bitcoin.programSizeInBitcoinBytes());
// console.log(buf.length);

// 13696
