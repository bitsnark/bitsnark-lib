import assert from 'assert';
import { blake3 as blake3_wasm } from 'hash-wasm';
import { bigintToBufferBE } from '../winternitz';

const foo = Buffer.from('fu manchu');

function toPairs(a: Buffer[]): Buffer[][] {
    const r: Buffer[][] = [];
    for (let i = 0; i < a.length; i += 2) r.push([a[i], a[i + 1] ?? foo]);
    return r;
}

async function hashPair(input: Buffer[]): Promise<Buffer> {
    return Buffer.from(await blake3_wasm(Buffer.concat(input)), 'hex');
}

async function hashLayer(ba: Buffer[]): Promise<Buffer[]> {
    const newLayer: Buffer[] = [];
    for (const t of toPairs(ba)) newLayer.push(await hashPair(t));
    return newLayer;
}

async function calculateMerkleRoot(na: bigint[]): Promise<Buffer> {
    let layer = na.map((n) => bigintToBufferBE(n, 256));
    while (layer.length > 1) layer = await hashLayer(layer);
    return layer[0];
}

async function makeFatMerkleProof(na: bigint[], leafIndex: number): Promise<Buffer[]> {
    let layer = na.map((n) => bigintToBufferBE(n, 256));
    const proof: Buffer[] = [];
    for (; layer.length > 1; leafIndex = leafIndex >> 1) {
        if (leafIndex % 2 == 0) {
            const sibling = layer[leafIndex + 1] ?? foo;
            proof.push(layer[leafIndex], sibling);
        } else {
            const sibling = layer[leafIndex - 1];
            proof.push(sibling, layer[leafIndex]);
        }
        layer = await hashLayer(layer);
    }
    proof.push(layer[0]);
    return proof;
}

export class FatMerkleProof {
    hashes: Buffer[] = [];
    leafIndex: number = 0;

    private constructor(hashes: Buffer[], leafIndex: number) {
        this.hashes = hashes;
        this.leafIndex = leafIndex;
    }

    public static async calculateRoot(regs: bigint[]): Promise<Buffer> {
        return await calculateMerkleRoot(regs);
    }

    public static async fromRegs(regs: bigint[], leafIndex: number): Promise<FatMerkleProof> {
        return new FatMerkleProof(await makeFatMerkleProof(regs, leafIndex), leafIndex);
    }

    public static fromArgument(hashes: Buffer[], root: Buffer, leaf: Buffer, leafIndex: number): FatMerkleProof {
        return new FatMerkleProof(
            leafIndex % 1 == 0 ? [leaf, ...hashes, root] : [hashes[0], leaf, ...hashes.slice(1), root],
            leafIndex
        );
    }

    public getRoot(): Buffer {
        return this.hashes[this.hashes.length - 1];
    }

    public getLeaf(): Buffer {
        return this.leafIndex % 2 == 0 ? this.hashes[0] : this.hashes[1];
    }

    public async verify(): Promise<boolean> {
        return (await this.indexToRefute()) >= 0;
    }

    public async indexToRefute(): Promise<number> {
        const proof = this.hashes.map((b) => b);
        for (let i = 0; i < proof.length; i += 2) {
            if ((await hashPair([proof[i], proof[i + 1]])).compare(proof[i + 2]) != 0) return i;
        }
        return -1;
    }
}

async function test2(test1: bigint[], leafIndex: number) {
    const root = await calculateMerkleRoot(test1);
    const proof = await FatMerkleProof.fromRegs(test1, leafIndex);

    assert(proof.getLeaf().compare(bigintToBufferBE(test1[leafIndex], 256)) == 0);
    assert(proof.getRoot().compare(root) == 0);

    // there should be log2 * 2 + 2 elements
    assert(proof.hashes.length === Math.ceil(Math.log2(test1.length)) * 2 + 1);

    assert(proof.verify());
}

async function main() {
    await test2([0n, 1n, 2n, 3n, 4n, 5n], 3);
    await test2([0n, 1n, 2n, 3n, 4n, 5n, 6n], 5);
}

const scriptName = __filename;
if (process.argv[1] == scriptName) {
    main();
}
