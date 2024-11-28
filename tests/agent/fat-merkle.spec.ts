import { calculateMerkleRoot, FatMerkleProof } from '../../src/agent/protocol-logic/fat-merkle';
import { bigintToBufferBE } from '../../src/agent/common/encoding';

async function test2(test1: bigint[], leafIndex: number) {
    it('', async () => {
        const root = await calculateMerkleRoot(test1);
        const proof = await FatMerkleProof.fromRegs(test1, leafIndex);
        const t = proof.getLeaf().compare(bigintToBufferBE(test1[leafIndex], 256));
        expect(t).toBe(0);
        expect(proof.getRoot().compare(root)).toBe(0);
        // there should be log2 * 2 + 2 elements
        expect(proof.hashes.length).toEqual(Math.ceil(Math.log2(test1.length)) * 2 + 1);
        expect(proof.verify()).toBeTruthy();
    });
}

describe('fat merkle', () => {
    test2([0n, 1n, 2n, 3n, 4n, 5n], 3);
    test2([0n, 1n, 2n, 3n, 4n, 5n, 6n], 5);
});
