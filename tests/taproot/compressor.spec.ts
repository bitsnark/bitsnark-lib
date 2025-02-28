import { describe, expect, it } from '@jest/globals';

import { Compressor, SimpleTapTree } from '../../src/agent/common/taptree';
import { stringToBigint } from '../../src/agent/common/encoding';
import { getHash } from '../../src/common/taproot-common';
import { testCases, internalPubkey, Testcase } from './testdata';

describe('Compressor', () => {
    it.each(testCases)('compressor test case %#', (testcase: Testcase) => {
        const scripts = testcase.given.scripts.map((s) => Buffer.from(s, 'hex'));
        const compressor = new Compressor(scripts.length, 0);
        compressor.setInteralPubKey(stringToBigint(internalPubkey));
        scripts.forEach((s) => compressor.addHash(getHash(s)));

        const tapTree = new SimpleTapTree(
            stringToBigint(internalPubkey),
            testcase.given.scripts.map((s) => Buffer.from(s, 'hex'))
        );

        const sanityRoot = tapTree.getRoot();
        expect(sanityRoot.toString('hex')).toBe(testcase.expected.root);

        const root = compressor.getRoot();
        expect(root.toString('hex')).toBe(testcase.expected.root);

        const scriptPubKey = compressor.getTaprootPubkey();

        // XXX: we mean scriptPubKey here and bitcoinjs-lib calls it "output" (we don't mean taproot pubkey)
        // const sanityScriptPubKey = tapTree.getTaprootPubkey();
        const sanityScriptPubKey = tapTree.getTaprootOutput();

        // expect(sanityScriptPubKey.toString('hex')).toBe(testcase.expected.scriptPubKey);
        expect(scriptPubKey.toString('hex')).toBe(testcase.expected.scriptPubKey);
        expect(scriptPubKey.toString('hex')).toBe(sanityScriptPubKey.toString('hex'));

        const sanityControlBlock = tapTree.getControlBlock(0);
        expect(sanityControlBlock.toString('hex')).toBe(testcase.expected.scriptPathControlBlocks[0]);

        const controlBlock = compressor.getControlBlock();
        expect(controlBlock.toString('hex')).toBe(testcase.expected.scriptPathControlBlocks[0]);
    });
});
