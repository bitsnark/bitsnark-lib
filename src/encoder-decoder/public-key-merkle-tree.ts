import { readFromFile, getFileSizeBytes, readTextFile } from "./files-utils";
import { MerkleTree } from 'merkletreejs';
import { PUB_KEY_FILE } from "./files-utils";
import { createHash } from "crypto";

export interface iMerkleProof {
    proof: {
        position: string;
        data: Buffer;
    }[];
    leaf: string;
    isVerified: boolean;
}

function localHash(b: Buffer): Buffer {
    return createHash('sha256').update(b).digest();
}

export class PublickKeyMerkleTree {
    private elementSize: number;
    private setSize: number;
    private folder: string;
    private merkleTree: MerkleTree;
    private merkleTreeLeaves: string[] = [];

    constructor(folder: string, elementSize: number = 32, setSize: number = 2) {
        this.elementSize = elementSize;
        this.setSize = setSize;
        this.folder = folder;
        this.merkleTree = new MerkleTree([], localHash);
    }

    createMerkleTreeFromPublickKey(): MerkleTree {
        if (this.merkleTreeLeaves.length === 0) {
            const publickKeySetSize = getFileSizeBytes(this.folder, PUB_KEY_FILE);
            const demoTemplate = readTextFile('template.txt');

            for (let i = 0; i < publickKeySetSize / (this.elementSize * this.setSize); i++) {
                let publicKeySetString = this.getUnitHashSet(i, this.folder);

                this.merkleTreeLeaves.push(
                    this.createLeafScript(
                        demoTemplate,
                        publicKeySetString,
                        i
                    )
                );
            }

            this.merkleTree = new MerkleTree(this.merkleTreeLeaves, localHash);
        }
        return this.merkleTree;
    }


    createLeafScript(demoTemplate: string, publicKeySet: string, i: number) {
        let leafText = demoTemplate.replace('[index]', i.toString());
        leafText = leafText.replace('[publicKeySet]', publicKeySet);
        return leafText;
    }

    getUnitHashSet(setStartIndex: number, publickKeyFolder: string): string {
        let publicKeySetString = '';
        for (let s = 0; s < this.setSize; s++) {
            const readFrom = (setStartIndex * this.elementSize * this.setSize) + s * this.elementSize;
            const publicKeyBuffer = readFromFile(publickKeyFolder, PUB_KEY_FILE, readFrom, this.elementSize);
            publicKeySetString += publicKeyBuffer.toString('hex') + ',';
        }
        return publicKeySetString;
    }

    createMerkleRootFromPublicKey(): Buffer {
        if (this.merkleTreeLeaves.length === 0) {
            this.merkleTree = this.createMerkleTreeFromPublickKey();
        }
        return this.merkleTree.getRoot();
    }

    getMerkleProof(merkleRoot: Buffer, conlictedIndex: number): iMerkleProof {
        try {
            const merkleTree = this.createMerkleTreeFromPublickKey();
            const keyList = this.getUnitHashSet(conlictedIndex, this.folder);
            const demoTemplate = readTextFile('template.txt');
            const leaf = this.createLeafScript(demoTemplate, keyList, conlictedIndex);
            const proof = merkleTree.getProof(leaf);
            return {
                proof: proof,
                leaf: leaf,
                isVerified: merkleTree.verify(proof, leaf, merkleRoot)
            };

        } catch (err: any) {
            console.error('Error getting the merkle proof:', err.message);
            throw new Error(err.message);
        }
    }
}
