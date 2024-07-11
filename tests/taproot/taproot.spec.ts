import { TapNode, taprootControlBlock, taprootOutputScript } from "../../src/generator/taproot/taproot";

const testVectors = require('./test-vectors.json');

class TestNode extends TapNode {
    constructor(private testcase: any) {
        super([]);
    }
    script?: Buffer;
    fromPath(path: number[]): TapNode {
        const t = new TestNode(path);
        let tn = this.testcase;
        for (let i = 0; i < path.length; i++) {
            tn = tn[path[i]];
        }
        t.script = tn.script && Buffer.from(tn.script, 'hex');
        return t;
    }
    isLeaf(): boolean {
        return !!this.script;
    }
    getScript(): Buffer {
        return this.script!;
    }
}

describe('taproot', () => {

    it ('scriptPubKey', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const result = taprootOutputScript(Buffer.from(publicKey, 'hex'), new TestNode(scriptTree));
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPubKey;
        expect(result.toString('hex')).toBe(expected);
    });

    it ('scriptPubKey', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const index = 0;
        const result = taprootControlBlock(Buffer.from(publicKey, 'hex'),  new TestNode(scriptTree), index);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPathControlBlocks[0];
        expect(result.toString('hex')).toBe(expected);
    });
});