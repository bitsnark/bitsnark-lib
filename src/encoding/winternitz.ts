import { hash, writeBigintToBuffer } from "./encoding";

const winternitzSecret = 0x92654528273736353535555533553553874383876346n;

function getWinternitzPrivateKey(index: number): bigint {
    return hash(winternitzSecret + BigInt(index));
}

function getWinternitzPublicKey(index: number): bigint {
    return hash(getWinternitzPrivateKey(index), 8);
}

export function getWinternitzPrivateKeys32(chunkIndex: number): bigint[] {
    const t: bigint[] = [];
    for (let i = 0; i < 14; i++) {
        t.push(getWinternitzPrivateKey(chunkIndex * 14 + i));
    }
    return t;
}

export function getWinternitzPublicKeys32(chunkIndex: number): bigint[] {
    const t: bigint[] = [];
    for (let i = 0; i < 14; i++) {
        t.push(getWinternitzPublicKey(chunkIndex * 14 + i));
    }
    return t;
}

export function getWinternitzPrivateKeys256(chunkIndex: number): bigint[] {
    const t: bigint[] = [];
    for (let i = 0; i < 90; i++) {
        t.push(getWinternitzPrivateKey(chunkIndex * 90 + i));
    }
    return t;
}

export function getWinternitzPublicKeys256(chunkIndex: number): bigint[] {
    const t: bigint[] = [];
    for (let i = 0; i < 90; i++) {
        t.push(getWinternitzPublicKey(chunkIndex * 90 + i));
    }
    return t;
}

function toNibbles(input: bigint, count: number): number[] {
    const W = 3;
    const nibbles: number[] = [];
    for (let i = 0; i < count; i++) {
        let nibble = 0;
        for (let j = 0; j < W; j++) {
            nibble += Number(input & 1n) << j;
            input = input >> 1n;
        }
        nibbles.push(nibble);
    }
    return nibbles;
}

export function encodeWinternitz32(input: bigint, chunkIndex: number): Buffer {
    const checksumNibbles = 3;
    const dataNibbles = 11;
    const hashSizeBytes = 32;
    const outputSizeBytes = (dataNibbles + checksumNibbles) * hashSizeBytes;
    let output = Buffer.alloc(outputSizeBytes);
    let checksum = 0;
    const privateKeys = getWinternitzPrivateKeys32(chunkIndex);
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        writeBigintToBuffer(output, i * hashSizeBytes, hash(privateKeys[i], t), hashSizeBytes);
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        writeBigintToBuffer(output, (dataNibbles + i) * hashSizeBytes, hash(privateKeys[11 + i], nibble), hashSizeBytes);
    });
    return output;
}

export function decodeWinternitz32(input: bigint[], chunkIndex: number): bigint {
    const nibbles: number[] = [];
    const dataNibbles = 11;
    const publicKeys = getWinternitzPublicKeys32(chunkIndex);
    for (let i = 0; i < dataNibbles; i++) {
        let h = input[i];
        for (let j = 0; j < 8; j++) {
            h = hash(h);
            if (h == publicKeys[i]) {
                nibbles.push(j);
                break;
            }
        }
        if (h != publicKeys[i]) throw new Error('Decoding error');
    }
    let n = 0n;
    nibbles.forEach((tn, i) => {
        n += BigInt(tn) << (BigInt(i) * 3n);
    });
    return n;
}

export function encodeWinternitz256(input: bigint, chunkIndex: number): Buffer {
    const checksumNibbles = 4;
    const dataNibbles = 86;
    const hashSizeBytes = 32;
    const outputSizeBytes = (dataNibbles + checksumNibbles) * hashSizeBytes;
    let output = Buffer.alloc(outputSizeBytes);
    let checksum = 0;
    const privateKeys = getWinternitzPrivateKeys256(chunkIndex);
    toNibbles(input, dataNibbles).forEach((nibble, i) => {
        checksum += nibble;
        const t = 7 - nibble;
        writeBigintToBuffer(output, i * hashSizeBytes, hash(privateKeys[i], t), hashSizeBytes);
    });
    toNibbles(BigInt(checksum), checksumNibbles).forEach((nibble, i) => {
        writeBigintToBuffer(output, (dataNibbles + i) * hashSizeBytes, hash(privateKeys[86 + i], nibble), hashSizeBytes);
    });
    return output;
}

export function decodeWinternitz256(input: bigint[], chunkIndex: number): bigint {
    const nibbles: number[] = [];
    const dataNibbles = 86;
    const publicKeys = getWinternitzPublicKeys256(chunkIndex);
    for (let i = 0; i < dataNibbles; i++) {
        let h = input[i];
        for (let j = 0; j < 8; j++) {
            h = hash(h);
            if (h == publicKeys[i]) {
                nibbles.push(j);
                break;
            }
        }
        if (h != publicKeys[i]) throw new Error('Decoding error');
    }
    let n = 0n;
    nibbles.forEach((tn, i) => {
        n += BigInt(tn) << (BigInt(i) * 3n);
    });
    return n;
}
