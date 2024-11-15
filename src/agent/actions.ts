import { FundingUtxo } from './common';
import * as bitcoinlib from 'bitcoinjs-lib';

// TODO:
export function createPayloadTx(_dontKnowWhatGoesHere?: any): FundingUtxo {
    const tx = new bitcoinlib.Psbt().extractTransaction();
    if (tx.outs.length != 1) throw new Error('Payload UTXO must have 1 output');
    const amount = tx.outs[0].value;
    return {
        txId: tx.getId(),
        external: true,
        amount: BigInt(amount),
        outputIndex: 0,
        serializedTransaction: tx.toBuffer()
    };
}

// TODO:
export function sendPayloadTx(setupId: string, payload: FundingUtxo) {}

// TODO:
export function sendProverStake(_dontKnowWhatGoesHere?: any): FundingUtxo {
    const tx = new bitcoinlib.Psbt().extractTransaction();
    if (tx.outs.length != 1) throw new Error('Prover stake UTXO must have 1 output');
    const amount = tx.outs[0].value;
    return {
        txId: tx.getId(),
        external: true,
        amount: BigInt(amount),
        outputIndex: 0,
        serializedTransaction: tx.toBuffer()
    };
}

// TODO:
export function sendVerifierPayment(_dontKnowWhatGoesHere?: any): FundingUtxo {
    const tx = new bitcoinlib.Psbt().extractTransaction();
    if (tx.outs.length != 1) throw new Error('Verifier payment UTXO must have 1 output');
    const amount = tx.outs[0].value;
    return {
        txId: tx.getId(),
        external: true,
        amount: BigInt(amount),
        outputIndex: 0,
        serializedTransaction: tx.toBuffer()
    };
}
