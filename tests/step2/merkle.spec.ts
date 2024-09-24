import { Register } from "../../src/generator/common/register";
import { step2_vm, step2_vm as vm } from "../../src/generator/step2/vm/vm";
import { verifyMerkleProof } from "../../src/generator/step2/merkle"
import { makeMerkleProof, verifyMerkleProof as verifyMerkleProofReference } from '../../src/encoding/merkle';
import { _256To32BE, _32To256BE } from '../../src/encoding/encoding';

const testMerkleTreeLeaves: bigint[][] = [
    [0xca978112n, 0xca1bbdcan, 0xfac231b3n, 0x9a23dc4dn, 0xa786eff8n, 0x147c4e72n, 0xb9807785n, 0xafee48bbn],
    [0x3e23e816n, 0x0039594an, 0x33894f65n, 0x64e1b134n, 0x8bbd7a00n, 0x88d42c4an, 0xcb73eeaen, 0xd59c009dn],
    [0x2e7d2c03n, 0xa9507ae2n, 0x65ecf5b5n, 0x356885a5n, 0x3393a202n, 0x9d241394n, 0x997265a1n, 0xa25aefc6n],
    [0x18ac3e73n, 0x43f01689n, 0x0c510e93n, 0xf9352611n, 0x69d9e3f5n, 0x65436429n, 0x830faf09n, 0x34f4f8e4n],
    [0x3f79bb7bn, 0x435b0532n, 0x1651daefn, 0xd374cdc6n, 0x81dc06fan, 0xa65e374en, 0x38337b88n, 0xca046dean]
];

const testProof: bigint[][] = [
    [0x18ac3e73n, 0x43f01689n, 0x0c510e93n, 0xf9352611n, 0x69d9e3f5n, 0x65436429n, 0x830faf09n, 0x34f4f8e4n],
    [0x2e7d2c03n, 0xa9507ae2n, 0x65ecf5b5n, 0x356885a5n, 0x3393a202n, 0x9d241394n, 0x997265a1n, 0xa25aefc6n],
    [0xe5a01feen, 0x14e0ed5cn, 0x48714f22n, 0x180f25adn, 0x8365b53fn, 0x9779f79dn, 0xc4a3d7e9n, 0x3963f94an],
    [0x6c0f2d23n, 0x8340cc5bn, 0xe1e7bd84n, 0x8d357224n, 0x87d30f27n, 0x559f6f07n, 0x362e6d5en, 0xac244c5dn],
    [0xc5ffe10bn, 0x5d57d0cen, 0x796fb761n, 0x76839472n, 0x97823bfen, 0xa51aed82n, 0x2ebe617bn, 0xb530b396n]
];

describe("SHA256 tests", function () {

    let target: Register[];

    beforeEach(() => {
        vm.reset();
        target = [];
        for (let i = 0; i < 8; i++) {
            target.push(vm.newRegister());
        }
    });

    it('Merkle proof positive', () => {

        const merkleProof = makeMerkleProof(testMerkleTreeLeaves.map(_32To256BE), 3);
        expect(verifyMerkleProofReference(merkleProof, 3)).toBe(true);
        expect(merkleProof.length).toBe(testProof.length);
        for (let i = 0; i < merkleProof.length; i++) {
            expect(_256To32BE(merkleProof[i])).toEqual(testProof[i]);
        }
        const witness = merkleProof.map(n => _256To32BE(n).map(n => step2_vm.addWitness(n)));
        step2_vm.startProgram();
        verifyMerkleProof(witness, 3);

        expect(step2_vm.getSuccess()).toBe(true);

        console.log('program size: ', step2_vm.instructions.length);
        console.log('registers: ', step2_vm.registers.filter(r => !r.hardcoded).length);
    });

    it('Merkle proof negative', () => {

        const merkleProof = makeMerkleProof(testMerkleTreeLeaves.map(_32To256BE), 3);

        // break it!
        merkleProof[2]++;

        const witness = merkleProof.map(n => _256To32BE(n).map(n => step2_vm.addWitness(n)));

        step2_vm.startProgram();
        verifyMerkleProof(witness, 3);

        expect(step2_vm.getSuccess()).toBe(false);
    });
});
