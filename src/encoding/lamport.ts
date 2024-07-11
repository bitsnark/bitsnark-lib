import { hash } from "./encoding";

const lamportSecret0 = 0x926545282738288272625524244424424424365542345634563456876346n;
const lamportSecret1 = 0x926545289734658217362726255242444244213452345423454383876346n;

function getLamportPrivateKey(index: number, bit: number): bigint {
    return hash(bit ? lamportSecret1 : lamportSecret0 + BigInt(index), 1);
}

export function getLamportPublicKey(index: number, bit: number): bigint {
    return hash(getLamportPrivateKey(index, bit));
}

export function getLamportPublicKeys(index: number, count: number): bigint[][] {
    const keys: bigint[][] = [];
    for (let i = 0; i < count; i++) {
        keys.push([
            getLamportPublicKey(index + i, 0),
            getLamportPublicKey(index + i, 1)
        ]);
    }
    return keys;
}

export function encodeLamportBit(keyIndex: number, bit: number): bigint {
    const k = getLamportPrivateKey(keyIndex, bit);
    return k;
}

export function decodeLamportBit(input: bigint, keyIndex: number): number {
    const k0 = getLamportPublicKey(keyIndex, 0);
    const k1 = getLamportPublicKey(keyIndex, 1);
    const h = hash(input);
    if (h == k0) return 0;
    if (h == k1) return 1;
    throw new Error('Invaid Lamport value');
}
