import { Bitcoin } from "../generator/step3/bitcoin";
import { TapNode, taprootControlBlock, taprootOutputScript } from "../generator/taproot/taproot";
import { CodecProvider } from "./codec-provider";

export class EquivocationTapNode extends TapNode {
    private provider
    private treeDepth;


    constructor(private path: number[], provider: CodecProvider) {
        super();
        this.provider = provider;
        this.treeDepth = Math.ceil(Math.log2(provider.getUnitCount()));
    }

    getLeft(): TapNode {
        return new EquivocationTapNode([...this.path, 0], this.provider);
    }

    getRight(): TapNode {
        return new EquivocationTapNode([...this.path, 1], this.provider);
    }

    isLeaf(): boolean {
        return this.path.length == this.treeDepth;
    }

    getScript(): Buffer {
        const index = parseInt(this.path.map(n => `${n}`).join(''), 2);
        const bitcoin = new Bitcoin();
        this.provider.generateEquivocationScript(bitcoin, index);
        return bitcoin.programToBinary();
    }
}

export function makeEquivocationTaproot(internalPublicKey: Buffer, provider: CodecProvider) {
    return taprootOutputScript(internalPublicKey, new EquivocationTapNode([], provider));
}

export function getcontrolBlock(internalPublicKey: Buffer, provider: CodecProvider, despuitedIndex: number) {
    const despuitedIndexBinary = despuitedIndex.toString(2).split('').map(bit => parseInt(bit, 10));

    return taprootControlBlock(
        internalPublicKey,
        new EquivocationTapNode(
            [],
            provider),
        despuitedIndexBinary)


}