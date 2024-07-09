import assert from "assert";
import { hashPair } from "../../src/encoding/encoding";

function hashLayer(na: bigint[]): bigint[] {
    const newNa: bigint[] = [];
    for (let i = 0; i < na.length; i += 2) {
        const h = hashPair(na[i], na[i + 1] ?? 0n);
        newNa.push(h);
    }
    return newNa;
}

export function calculateMerkleRoot(na: bigint[]): bigint {
    while (na.length > 1) {
        na = hashLayer(na);
    }
    return na[0];
}

export function makeMerkleProof(na: bigint[], leafIndex: number) {
    const proof: bigint[] = [ na[leafIndex] ];
    while (na.length > 1) {
        const sibling = leafIndex % 2 == 0 ? na[leafIndex + 1] ?? 0n : na[leafIndex - 1];
        proof.push(sibling);
        na = hashLayer(na);
        leafIndex = leafIndex >> 1;
    }
    proof.push(na[0]);
    return proof;
}

export function verifyMerkleProof(proof: bigint[], leafIndex: number): boolean {
    proof = proof.map(n => n);
    while (proof.length > 2) {
        const a = proof.shift()!;
        const b = proof.shift()!;
        const h = (leafIndex & 1) == 0 ? hashPair(a, b) : hashPair(b, a);
        proof.unshift(h);
        leafIndex = leafIndex >> 1;
    }
    return proof[0] == proof[1];
}

function test(test1: bigint[], leafIndex: number) {
    const root = calculateMerkleRoot(test1);
    const proof = makeMerkleProof(test1, leafIndex);
    assert(proof[0] == test1[leafIndex]);
    assert(proof[proof.length - 1] == root);
    assert(proof.length == Math.ceil(Math.log2(test1.length)) + 2);
    const flag = verifyMerkleProof(proof, leafIndex);
    assert(flag);
}

test([ 0n, 1n, 2n, 3n, 4n, 5n ], 3);
test([ 0n, 1n, 2n, 3n, 4n, 5n, 6n ], 5);
