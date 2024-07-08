import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { proof, publicSignals } from './proof';
import { encodeWinternitz256, getWinternitzPublicKeys256 } from '../../src/encoding/winternitz';
import { bufferToBigints256 } from '../../src/encoding/encoding';
import { getEncodingIndexForPat, ProtocolStep } from './common';

export function createInitialTx(): bigint[] {

    const bitcoin = new Bitcoin();
    const publicKeys: bigint[] = [];
    const encodedWitness: bigint[] = [];
    [
        ...proof.pi_a,
        proof.pi_b[0][1], proof.pi_b[0][0], proof.pi_b[1][1], proof.pi_b[1][0],        
        ...proof.pi_c,
        ...publicSignals
    ]
        .map(s => BigInt(s))
        .forEach((w, i) => {
            const chunkIndex = getEncodingIndexForPat(ProtocolStep.INITIAL, 0, i);
            const buffer = encodeWinternitz256(w, chunkIndex);
            encodedWitness.push(...bufferToBigints256(buffer));
            publicKeys.push(...getWinternitzPublicKeys256(chunkIndex));
        });

    bitcoin.checkInitialTransaction(
        encodedWitness.map(n => bitcoin.addWitness(n)), 
        publicKeys);

    if (!bitcoin.success) throw new Error('Failed');

    console.log('********************************************************************************')
    console.log('Initial (PAT):');
    console.log('data size: ', encodedWitness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);
    console.log('witness: ', encodedWitness.map(n => n.toString(16)));
    // console.log('program: ', bitcoin.programToString());

    return encodedWitness;
}
