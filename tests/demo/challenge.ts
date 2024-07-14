import { SavedVm } from '../../src/generator/common/saved-vm';
import { Runner } from '../../src/generator/step1/vm/runner';
import { InstrCode } from '../../src/generator/step1/vm/types';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { ProtocolStep, ProtocolRole } from './common';
import { writeToFile } from './utils';

export function createChallengeTx(savedProgram: SavedVm<InstrCode>, encodedWitness: bigint[]): boolean {

    const runner = Runner.load(savedProgram);
    runner.execute();

    if (runner.getSuccess()) {
        console.log('Proof checks out');
        return false;
    }

    const bitcoin = new Bitcoin();
    const witness: bigint[] = [];

    if (!bitcoin.success) throw new Error('Failed');

    writeToFile(bitcoin, ProtocolStep.CHALLENGE, ProtocolRole.VIC);
    
    return true;
}
