
export interface MerkleProofWitness {
    hashes: bigint[][];
    root: bigint[];
}

function prepareWitness(n: bigint): bigint[] {
    const words = [];
    for (let i = 7; i >= 0; i--) {
        let tn = 0n;
        for (let j = 0; j < 32; j++) {
            const bit = n & 0x01n;
            n = n >> 1n;
            tn += bit * 2n ** BigInt(j);
        }
        words[i] = tn;
    }
    return words;
}

export function createWitness(hashes: bigint[], root: bigint): MerkleProofWitness {
    return {
        hashes: hashes.map(h => prepareWitness(h)),
        root: prepareWitness(root)
    };
}
