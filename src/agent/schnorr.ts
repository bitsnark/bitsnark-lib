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

    const myMessage = `Hello, World!`;
    const signature = signMessage(`Hello, World!`, keypair.privateKey);
    console.log('Signature:', signature);

    const verified = verifyMessage(myMessage, signature, keypair.publicKey);
    console.log('Is message verified?', verified);
}
