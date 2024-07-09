import { Register } from "../../src/generator/common/register";
import { step2_vm, step2_vm as vm, VM } from "../../src/generator/step2/vm/vm";
import { sha256, sha256pair } from "../../src/generator/step2/sha-256";
import { _256 } from "../../src/generator/step2/vm/types"
import { verifyMerkleProof } from "../../src/generator/step2/merkle"
import { makeMerkleProof, verifyMerkleProof as verifyMerkleProofReference } from '../../src/encoding/merkle';
import { _256To32BE, _32To256BE } from '../../src/encoding/encoding';

const leafIndex = 3;

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

const a_hex: bigint[] = [0x1516f000n, 0xde6cff5cn, 0x8c63eef0n, 0x81ebcec2n, 0xad2fdcf7n, 0x034db160n, 0x45d024a9n, 0x0341e07dn]
const b_hex: bigint[] = [0xe20af19fn, 0x85f26557n, 0x9ead2578n, 0x859bf089n, 0xc92b76a0n, 0x48606983n, 0xad83f27bn, 0xa8f32f1an]
const a_hash_hex: bigint[] = [0x846bea34n, 0x8ecfdf71n, 0xde201960n, 0x619a910bn, 0x11b8e9ben, 0xd9185762n, 0x81f5078bn, 0x08c2d6cen]
const ab_hash_hex: bigint[] = [0x77c654b3n, 0xd1605f78n, 0xed091cbdn, 0x420c939cn, 0x3feff7d5n, 0x7dc30c17n, 0x1fa45a5an, 0x3c81fd7dn]

describe("SHA256 tests", function () {

    let target: Register[];

    beforeEach(() => {
        vm.reset();
        target = [];
        for (let i = 0; i < 8; i++) {
            target.push(vm.newRegister());
        }
    });

    function check(got: _256, exp: bigint[]) {
        for (let i = 0; i < 8; i++) {
            expect(got[i].value).toEqual(exp[i])
        }
    }

    it('256 bit input hash', () => {
        const aRegs = a_hex.map(n => vm.addWitness(n));
        vm.startProgram();
        sha256(target, aRegs);
        check(target, a_hash_hex);
    });

    it('512 bit input hash', () => {
        const aRegs = a_hex.map(n => vm.addWitness(n));
        const bRegs = b_hex.map(n => vm.addWitness(n));
        vm.startProgram();
        sha256pair(target, aRegs, bRegs);
        check(target, ab_hash_hex);
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
        verifyMerkleProof(3, witness);

        expect(step2_vm.getSuccess()).toBe(true);
    });

    it('Merkle proof negative', () => {

        const merkleProof = makeMerkleProof(testMerkleTreeLeaves.map(_32To256BE), 3);

        // break it!
        merkleProof[2]++;

        const witness = merkleProof.map(n => _256To32BE(n).map(n => step2_vm.addWitness(n)));

        step2_vm.startProgram();
        verifyMerkleProof(3, witness);

        expect(step2_vm.getSuccess()).toBe(false);
    });
});
