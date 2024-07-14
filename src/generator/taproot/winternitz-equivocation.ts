import { getWinternitzPublicKeys32 } from "../../encoding/winternitz";
import { Bitcoin } from "../step3/bitcoin";
import { TapNode, taprootOutputScript } from "./taproot";

const treeDepth = 7;

class WinternitzEquivocationTaprootNode extends TapNode {

    constructor(private path: number[]) {
        super();
    }

    getLeft(): TapNode {
        return new WinternitzEquivocationTaprootNode([...this.path, 0]);
    }

    getRight(): TapNode {
        return new WinternitzEquivocationTaprootNode([...this.path, 1]);
    }

    isLeaf(): boolean {
        return this.path.length == treeDepth;
    }

    getScript(): Buffer {
        const cunck = parseInt(this.path.map(n => `${n}`).join(), 2);
        const kArr = getWinternitzPublicKeys32(cunck);
        const bitcoin = new Bitcoin();
        const wArr = Array.from({ length: 14 }, () => bitcoin.addWitness(0n));
        const decodedItems = [];
        for (let i = 0; i < 11 + 3; i++) decodedItems.push(bitcoin.newStackItem(0n));
        bitcoin.winternitzEquivocation32(decodedItems, wArr, wArr, kArr);
        return bitcoin.programToBinary();
    }
}

export function makeWinternitzEquivocationTaproot(internalPublicKey: Buffer) {
    return taprootOutputScript(internalPublicKey, new WinternitzEquivocationTaprootNode([]));
}


