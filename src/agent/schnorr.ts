import * as secp256k1 from 'tiny-secp256k1';
import * as crypto from 'crypto';

// Function to generate a Schnorr keypair
function generateSchnorrKeypair() {
    // Generate a private key
    let privateKey: Buffer;
    do {
        privateKey = crypto.randomBytes(32);
    } while (!secp256k1.isPrivate(privateKey)); // Ensure it's a valid private key

    // Generate the corresponding public key
    const publicKey = secp256k1.pointFromScalar(privateKey, true); // true = compressed format

    if (!publicKey) {
        throw new Error("Failed to generate public key.");
    }

    return {
        privateKey: privateKey.toString('hex'),
        publicKey: Buffer.from(publicKey).toString('hex')
    };
}

// Generate a keypair
const keypair = generateSchnorrKeypair();
console.log('Private Key:', keypair.privateKey);
console.log('Public Key:', keypair.publicKey);
