import { TapNode, taprootControlBlock, taprootOutputScript } from "../../src/generator/taproot/taproot";


const testVectors = require('./test-vectors.json');

class TestNode extends TapNode {

    path: number[] = [];

    constructor(private testcase: any) {
        super();
    }

    getLeft(): TestNode {
        if (this.isLeaf()) return new TestNode({});
        return new TestNode(this.testcase[0]);
    }

    getRight(): TestNode {
        if (this.isLeaf()) return new TestNode({});
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

    it('scriptPubKey', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const root = new TestNode(scriptTree);
        const result = taprootOutputScript(Buffer.from(publicKey, 'hex'), root);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPubKey;
        expect(result.toString('hex')).toBe(expected);
    });

    // it('Lamport equivocation script', () => {
    //     const testcase = testVectors.scriptPubKey[6];
    //     const publicKey = testcase.given.internalPubkey;
    //     const r = makeLamportEquivocationTaproot(Buffer.from(publicKey, 'hex'));
    //     expect(r.toString('hex')).toEqual('5120ac817424521b1ef0c393b689c6d98985e8978fe309e9e06a031ebb925da9d88a');
    // });

    // it('Winternitz equivocation script', () => {
    //     const testcase = testVectors.scriptPubKey[2];
    //     const publicKey = testcase.given.internalPubkey;
    //     const r = makeWinternitzEquivocationTaproot(Buffer.from(publicKey, 'hex'));
    //     expect(r.toString('hex')).toEqual('5120d4314353952493527780c24fa4d63228bd92ae51d95ed53438f55d8818a51857');
    // });

    it('control block 1', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const testNode = new TestNode(scriptTree);
        const path = [0]
        const result = taprootControlBlock(Buffer.from(publicKey, 'hex'), testNode, path);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPathControlBlocks[0];
        expect(result.toString('hex')).toBe(expected);
    });

    it('control block 2', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const testNode = new TestNode(scriptTree);
        const path = [1, 0]
        const result = taprootControlBlock(Buffer.from(publicKey, 'hex'), testNode, path);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPathControlBlocks[1];
        expect(result.toString('hex')).toBe(expected);
    });

    it('control block 3', () => {
        const testcase = testVectors.scriptPubKey[6];
        const publicKey = testcase.given.internalPubkey;
        const scriptTree = testcase.given.scriptTree;
        const testNode = new TestNode(scriptTree);
        const path = [1, 1]
        const result = taprootControlBlock(Buffer.from(publicKey, 'hex'), testNode, path);
        console.log(result.toString('hex'));
        const expected = testcase.expected.scriptPathControlBlocks[2];
        expect(result.toString('hex')).toBe(expected);
    });
});