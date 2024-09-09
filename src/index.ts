

import { CodecType } from './encoder-decoder/codec-provider';
import { TxDecoder } from './encoder-decoder/tx-decoder';

export enum Identity {
    prover = 1,
    verifier = 2,
}

export function decodeTx(pubKeys: Buffer, prvKeys: Buffer, step: number, identity: Identity) {
    if (identity === Identity.prover && step < 20) {
        const winternitz256 = new TxDecoder(CodecType.winternitz256);

        return winternitz256.decodePrvByPub(prvKeys, pubKeys);
    }
    else if (identity === Identity.verifier && step > 1 && step < 20) {
        const lamport = new TxDecoder(CodecType.lamport);

        return lamport.decodePrvByPub(prvKeys, pubKeys);
    }

    return Buffer.from('');
}
