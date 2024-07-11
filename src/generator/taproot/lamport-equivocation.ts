import { getLamportPublicKey } from "../../encoding/lamport";
import { Bitcoin } from "../step3/bitcoin";
import { TapNode, taprootOutputScript } from "./taproot";

const treeDepth = 7;

class LamportEquivocationTaprootNode extends TapNode {

    constructor(private path: number[]) {
        super();
    }

    getLeft(): TapNode {
        return new LamportEquivocationTaprootNode([ ...this.path, 0 ]);
    }

    getRight(): TapNode {
        return new LamportEquivocationTaprootNode([ ...this.path, 1 ]);
    }

    isLeaf(): boolean {
        return this.path.length == treeDepth;
    }

    getScript(): Buffer {
        const index = parseInt(this.path.map(n => `${n}`).join(), 2);
        const k0 = getLamportPublicKey(index, 0);
        const k1 = getLamportPublicKey(index, 1);
        const bitcoin = new Bitcoin();
        const w0 = bitcoin.addWitness(0n);
        const w1 = bitcoin.addWitness(0n);
        bitcoin.lamportEquivocation([ w0, w1 ], [ k0, k1 ]);
        return bitcoin.programToBinary();
    }
}

export function makeLamportEquivocationTaproot(internalPublicKey: Buffer) {
    return taprootOutputScript(internalPublicKey, new LamportEquivocationTaprootNode([]));
}

