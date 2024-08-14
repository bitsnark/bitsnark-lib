import { Bitcoin } from '../../../src/generator/step3/bitcoin';
import { bufferToBigints256BE } from '../../encoding/encoding';
import { encodeWinternitz256, getWinternitzPublicKeys256 } from '../../encoding/winternitz';
import { getEncodingIndexForPat, ProtocolStep } from '../common';
import { proof, publicSignals } from '../proof';

function createScriptInitial(schnorrPublicKeys: string[]): Buffer { 

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
            encodedWitness.push(...bufferToBigints256BE(buffer));
            publicKeys.push(...getWinternitzPublicKeys256(chunkIndex));
        });

    bitcoin.checkInitialTransaction(
        encodedWitness.map(n => bitcoin.addWitness(n)),
        publicKeys);

    if (!bitcoin.success) throw new Error('Failed');

    return bitcoin.programToBinary();
}


