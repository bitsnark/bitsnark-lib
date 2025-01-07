import { blake3 as blake3_wasm } from 'hash-wasm';
import { bigintToBufferBE } from '../common/encoding';
import { last } from '../common/array-utils';

const foo = Buffer.from('fu manchu');

function toPairs(a: Buffer[]): Buffer[][] {
    const r: Buffer[][] = [];
    for (let i = 0; i < a.length; i += 2) r.push([a[i] ?? foo, a[i + 1] ?? foo]);
    return r;
}

async function hashPair(input: Buffer[]): Promise<Buffer> {
    return Buffer.from(await blake3_wasm(Buffer.concat(input)), 'hex');
}

async function hashLayer(ba: Buffer[]): Promise<Buffer[]> {
    const newLayer: Buffer[] = [];
    for (const t of toPairs(ba)) {
        const tt = await hashPair(t);
        newLayer.push(tt);
    }
    return newLayer;
}

export async function calculateMerkleRoot(na: bigint[]): Promise<Buffer> {
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

    public static fromArgument(hashes: Buffer[], leaf: Buffer, root: Buffer, leafIndex: number): FatMerkleProof {
        let h: Buffer[];
        if (leafIndex % 2 == 0) h = [leaf, ...hashes, root];
        else h = [hashes[0], leaf, ...hashes.slice(1), root];
        return new FatMerkleProof(h, leafIndex);
    }

    public getRoot(): Buffer {
        return last(this.hashes);
    }

    public getLeaf(): Buffer {
        return this.leafIndex % 2 == 0 ? this.hashes[0] : this.hashes[1];
    }

    public async verify(): Promise<boolean> {
        return (await this.indexToRefute()) >= 0;
    }

    public toArgument(): Buffer[] {
        // remove root
        const r = this.hashes.slice(0, this.hashes.length - 1);
        // remove leaf
        return this.leafIndex % 1 == 0 ? r.slice(1) : [r[0], ...r.slice(2)];
    }

    public async indexToRefute(): Promise<number> {
        const proof = this.hashes.map((b) => b);
        for (let i = 0; i < proof.length; i += 2) {
            if ((await hashPair([proof[i], proof[i + 1]])).compare(proof[i + 2]) != 0) return i;
        }
        return -1;
    }
}
