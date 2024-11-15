import assert from "assert";
import { createHash } from "crypto";
import { bigintToBufferBE } from "../winternitz";

export function hashPair(inputA: Buffer, inputB: Buffer): Buffer {
    const b = Buffer.concat([inputA, inputB]);
    return createHash('blake3').update(b).digest();
}

function hashLayer(na: Buffer[]): Buffer[] {
    const newLayer: Buffer[] = [];
    for (let i = 0; i < na.length; i += 2) {
        const h = hashPair(na[i], na[i + 1] ?? Buffer.from([]));
        newLayer.push(h);
    }
    return newLayer;
}

export function calculateMerkleRoot(na: bigint[]): Buffer {
    let layer = na.map(n => bigintToBufferBE(n, 256));
    while (layer.length > 1) {
        layer = hashLayer(layer);
    }
    return layer[0];
}

export function makeMerkleProof(na: bigint[], leafIndex: number) {
    let layer = na.map(n => bigintToBufferBE(n, 256));
    const proof: Buffer[] = [layer[leafIndex]];
    while (layer.length > 1) {
        const sibling = leafIndex % 2 == 0 ? layer[leafIndex + 1] ?? Buffer.from([]) : layer[leafIndex - 1];
        proof.push(sibling);
        layer = hashLayer(layer);
        leafIndex = leafIndex >> 1;
    }
    proof.push(layer[0]);
    return proof;
}

export function makeFatMerkleProof(na: bigint[], leafIndex: number) {
    let layer = na.map(n => bigintToBufferBE(n, 256));
    const proof: Buffer[] = [layer[leafIndex]];
    while (layer.length > 1) {
        const sibling = leafIndex % 2 == 0 ? layer[leafIndex + 1] ?? Buffer.from([]) : layer[leafIndex - 1];
        proof.push(sibling);
        layer = hashLayer(layer);
        leafIndex = leafIndex >> 1;
    }
    proof.push(layer[0]);
    return proof;
}

export function verifyMerkleProof(proof: Buffer[], leafIndex: number): boolean {
    proof = proof.map(b => b);
    while (proof.length > 2) {
        const a = proof.shift()!;
        const b = proof.shift()!;
        const h = (leafIndex & 1) == 0 ? hashPair(a, b) : hashPair(b, a);
        proof.unshift(h);
        leafIndex = leafIndex >> 1;
    }
    return proof[0] == proof[1];
}

export function verifyFatMerkleProof(proof: Buffer[], leafIndex: number): boolean {
    proof = proof.map(b => b);
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
    assert(proof[0] == bigintToBufferBE(test1[leafIndex], 256));
    assert(proof[proof.length - 1] == root);
    assert(proof.length == Math.ceil(Math.log2(test1.length)) + 2);
    const flag = verifyMerkleProof(proof, leafIndex);
    assert(flag);
}

test([0n, 1n, 2n, 3n, 4n, 5n], 3);
test([0n, 1n, 2n, 3n, 4n, 5n, 6n], 5);
