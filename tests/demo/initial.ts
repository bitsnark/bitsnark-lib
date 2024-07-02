import fs from 'fs';
import { Bitcoin } from '../../src/generator/step3/bitcoin';
import { bufferToBigints256, encodeWinternitz, winternitzKeys } from '../encoding';
import { proof, publicSignals } from './proof';

export async function createInitialTx() {
    const bitcoin = new Bitcoin();
    const encoded = [
        ...proof.pi_a,
        ...proof.pi_b[0],
        ...proof.pi_b[1],
        ...proof.pi_a,
        ...publicSignals
    ]
        .map(s => BigInt(s))
        .map((w, i) => encodeWinternitz(w, i, 256, 12));

    const encodedWitness: bigint[] = [];
    encoded.forEach(buffer => bufferToBigints256(buffer).forEach(n => encodedWitness.push(n)));
    const witness = encodedWitness.map(w => bitcoin.addWitness(w));
    const publicKeys = winternitzKeys.slice(0, witness.length).map(k => k.pblc);
    bitcoin.checkInitialTransaction(witness, publicKeys);

    if (!bitcoin.success) throw new Error('Failed');

    console.log('data size: ', encodedWitness.length * 32);
    console.log('progam size: ', bitcoin.programSizeInBitcoinBytes());
    console.log('max stack size: ', bitcoin.maxStack);

    const program = bitcoin.programToString();
    fs.writeFileSync('./generated/demo/initial.btc.txt', program);
    fs.writeFileSync('./generated/demo/initial.data.txt', encodedWitness.map(n => '0x' + n.toString(16)).join('\n'));
}

createInitialTx();

