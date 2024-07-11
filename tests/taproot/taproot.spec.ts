import { makeLamportEquivocationTaproot } from "../../src/generator/taproot/lamport-equivocation";
import { TapNode, taprootOutputScript } from "../../src/generator/taproot/taproot";

const testVectors = require('./test-vectors.json');

class TestNode extends TapNode {

    constructor(private testcase: any) {
        super();
    }

    getLeft(): TestNode {
        return new TestNode(this.testcase[0]);
    }

    getRight(): TestNode {
        return new TestNode(this.testcase[1]);
    }

    isLeaf(): boolean {
        return !Array.isArray(this.testcase);
    }

    getScript(): Buffer {
        return Buffer.from(this.testcase.script, 'hex');
    }
}

describe('taproot', () => {

    it ('scriptPubKey', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const root = new TestNode(scriptTree);
        const result = taprootOutputScript(Buffer.from(publicKey, 'hex'), root);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPubKey;
        expect(result.toString('hex')).toBe(expected);
    });

    it('Lamport equivocation script', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const r = makeLamportEquivocationTaproot(Buffer.from(publicKey, 'hex'));
        expect(r.toString('hex')).toEqual('5120ac817424521b1ef0c393b689c6d98985e8978fe309e9e06a031ebb925da9d88a');
    });

    // it ('scriptPubKey', () => {
    //     const testcase = testVectors.scriptPubKey[6];
    //     const publicKey = testcase.given.internalPubkey;
    //     const scriptTree = testcase.given.scriptTree;
    //     const index = 0;
    //     const result = taprootControlBlock(Buffer.from(publicKey, 'hex'),  new TestNode(scriptTree), index);
    //     console.log(result.toString('hex'));
    //     const expected = testcase.expected.scriptPathControlBlocks[0];
    //     expect(result.toString('hex')).toBe(expected);
    // });
});