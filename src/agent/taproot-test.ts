// from: https://dev.to/eunovo/a-guide-to-creating-taproot-scripts-with-bitcoinjs-lib-4oph

import {
    initEccLib,
    networks,
    script,
    Signer,
    payments,
    crypto,
    Psbt
} from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import { Taptree } from "bitcoinjs-lib/src/types";

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
initEccLib(tinysecp as any);
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const network = networks.testnet;

function start_taptree() {

    const keypair = ECPair.makeRandom({ network });

    // TapTree example
    console.log(`Running "Taptree example"`);

    // Create a tap tree with two spend paths
    // One path should allow spending using secret
    // The other path should pay to another pubkey

    const scriptTree: Taptree = [
        {
            output: Buffer.from('blah', 'utf-8')
        },
        {
            output: Buffer.from('bleh', 'utf-8')
        }
    ];

    const internalPubkey = toXOnly(keypair.publicKey);

    const script_p2tr = payments.p2tr({
        internalPubkey,
        scriptTree,
        network
    });
    const script_addr = script_p2tr.address ?? '';

}

function toXOnly(pubkey: Buffer): Buffer {
    return pubkey.subarray(1, 33)
}

start_taptree();
