import { TapNode } from "./taproot";

export class SimpleTree extends TapNode {

    script?: Buffer;
    left?: SimpleTree;
    right?: SimpleTree;

    constructor(script?: Buffer) {
        super();
        this.script = script;
    }

    isLeaf(): boolean {
        return !!this.script;
    }

    getScript(): Buffer {
        return this.script ?? Buffer.alloc(0);
    }

    getLeft(): TapNode {
        return this.left ?? new SimpleTree(Buffer.alloc(0));
    }

    getRight(): TapNode {
        return this.left ?? new SimpleTree(Buffer.alloc(0));
    }
}

export function arrayToTree(data: Buffer[]): SimpleTree {
    if (Math.log2(data.length) != Math.floor(Math.log2(data.length)))
        throw new Error('Length power of two please');
    const n = new SimpleTree();
    const leftData = data.slice(0, data.length / 2);
    n.left = arrayToTree(leftData);
    const rightData = data.slice(data.length / 2, data.length);
    n.right = arrayToTree(rightData);
    return n;
}
