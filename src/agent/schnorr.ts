import * as secp256k1 from 'tiny-secp256k1';
import * as crypto from 'crypto';

// Function to generate a Schnorr keypair
function generateSchnorrKeypair() {
    let privateKey: Buffer;
    do {
        privateKey = crypto.randomBytes(32);
    } while (!secp256k1.isPrivate(privateKey));

    const publicKey = secp256k1.xOnlyPointFromScalar(privateKey);

    if (!publicKey) {
        throw new Error("Failed to generate public key.");
    }

    return {
        privateKey: privateKey.toString('hex'),
        publicKey: Buffer.from(publicKey).toString('hex')
    };
}

export function signMessage(message: string, privateKey: string): string {
    const msgHash = crypto.createHash('sha256').update(message).digest();
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const signature = secp256k1.signSchnorr(msgHash, privateKeyBuffer);
    return Buffer.from(signature).toString('hex');
}

export function verifyMessage(message: string, signature: string, publicKey: string): boolean {
    const msgHash = crypto.createHash('sha256').update(message).digest();
    const signatureBuffer = Buffer.from(signature, 'hex');
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    console.log('Public key:', publicKeyBuffer, publicKeyBuffer.length);
    return secp256k1.verifySchnorr(msgHash, publicKeyBuffer, signatureBuffer);
}



if (__filename === process.argv[1]) {
    // Generate new keypair and sign and verify a message
    const keypair = generateSchnorrKeypair();
    console.log('Private Key:', keypair.privateKey, keypair.privateKey.length);
    console.log('Public Key:', keypair.publicKey, keypair.publicKey.length);

    const myMessage = `Hello, World!
        This is a message from the Bitsnark team.
        We are testing Schnorr signatures!
        Have a great day!`;


    // Sign the message
    const me = { private: keypair.privateKey, public: keypair.publicKey };

    const isPoint = secp256k1.isPoint(Buffer.from(me.public, 'hex'));

    console.log('Is point:', isPoint);
    console.log('length', Buffer.from(me.public, 'hex').length);
    const signature = signMessage(myMessage, me.private);
    console.log('Signature:', signature);

    // Verify the message
    const verified = verifyMessage(myMessage, signature, me.public);
    console.log('Message verified by me:', verified);

    //the keys we have in the config file
    const keyPairs = {
        bitsnark_prover_1: {
            public: process.env['PROVER_SCHNORR_PUBLIC'] ?? '02ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75',
            private: process.env['PROVER_SCHNORR_PRIVATE'] ?? '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2'
        },
        bitsnark_verifier_1: {
            public: process.env['VERIFIER_SCHNORR_PUBLIC'] ?? '0386ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79',
            private: process.env['VERIFIER_SCHNORR_PRIVATE'] ?? 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0'
        }
    }

    const pkb = secp256k1.xOnlyPointFromScalar(Buffer.from(keyPairs.bitsnark_prover_1.private, 'hex'));
    const vkb = secp256k1.xOnlyPointFromScalar(Buffer.from(keyPairs.bitsnark_verifier_1.private, 'hex'));
    console.log('prover public key is:', keyPairs.bitsnark_prover_1.public, 'and should be:', Buffer.from(pkb).toString('hex'));
    console.log('verifier public key:', keyPairs.bitsnark_verifier_1.public, 'and should be:', Buffer.from(vkb).toString('hex'));

    //using the current keys
    try {
        const confverified = verifyMessage(myMessage, signature, keyPairs.bitsnark_prover_1.public);
        console.log('Message verified by config:', confverified);
    } catch (e) {
        console.log('verify Schnorr error: old public is not fit for Schnorr for it is not the KUITZAT HADARC but of 33 length. \n', e);
    }
}
