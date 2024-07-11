import { SavedVm } from '../../src/generator/common/saved-vm';
import { Runner } from '../../src/generator/step1/vm/runner';
import { InstrCode } from '../../src/generator/step1/vm/types';
import { Bitcoin } from '../../src/generator/step3/bitcoin';

export function createChallengeTx(savedProgram: SavedVm<InstrCode>, encodedWitness: bigint[]): boolean {

    const runner = Runner.load(savedProgram);
    runner.execute();

    if (runner.getSuccess()) {
        console.log('Proof checks out');
        return false;
    }

    const bitcoin = new Bitcoin();
    const witness: bigint[] = [];

    console.log('********************************************************************************')
    console.log('Challenge (VIC):');
    console.log('data size: ', witness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    console.log('witness: ', witness.map(n  => n.toString(16)));
    // console.log('program: ', bitcoin.programToString());

    return true;
}
