import { describe, expect, it } from '@jest/globals';

import { DEAD_ROOT_HASH, SimpleTapTree } from '../../src/agent/common/taptree';
import { stringToBigint } from '../../src/agent/common/encoding';
import { testCases, internalPubkey, Testcase } from './testdata';

describe('SimpleTapTree', () => {
    it.each(testCases)('scriptPubKey test case %#', (testcase: Testcase) => {
        const tapTree = new SimpleTapTree(
            stringToBigint(internalPubkey),
            testcase.given.scripts.map((s) => Buffer.from(s, 'hex'))
        );

        const root = tapTree.getRoot();
        expect(root.toString('hex')).toBe(testcase.expected.root);

        const scriptPubKey = tapTree.getTaprootOutput();
        expect(scriptPubKey.toString('hex')).toBe(testcase.expected.scriptPubKey);

        const control = tapTree.getControlBlock(0);
        expect(control.toString('hex')).toBe(testcase.expected.scriptPathControlBlocks[0]);
    });

    it('should not crash when script is null', () => {
        const tapTree = new SimpleTapTree(stringToBigint(internalPubkey), []);
        const root = tapTree.getRoot();

        expect(root).toEqual(DEAD_ROOT_HASH);
    });
});
