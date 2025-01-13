import { describe, expect, it } from '@jest/globals';

import { Compressor, SimpleTapTree } from '../../src/agent/common/taptree';
import { stringToBigint } from '../../src/agent/common/encoding';
import { getHash } from '../../src/common/taproot-common';

describe('SimpleTapTree', () => {
    type Testcase = {
        given: {
            scripts: string[];
        };
        expected: {
            root: string;
            scriptPubKey: string;
            scriptPathControlBlocks: string[];
        };
    };

    const internalPubkey = 'e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f';
    const testCases = [
        {
            given: {
                scripts: ['20d85a959b0290bf19bb89ed43c916be835475d013da4b362117393e25a48229b8ac']
            },
            expected: {
                root: '5b75adecf53548f3ec6ad7d78383bf84cc57b55a3127c72b9a2481752dd88b21',
                scriptPubKey: '5120796965d59d0259aaf81f8763bb1f000b2ddf0b333d3d0182ce11cb41f8556566',
                scriptPathControlBlocks: ['c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f']
            }
        },
        {
            given: {
                scripts: ['2072ea6adcf1d371dea8fba1035a09f3d24ed5a059799bae114084130ee5898e69ac']
            },
            expected: {
                root: '2645a02e0aac1fe69d69755733a9b7621b694bb5b5cde2bbfc94066ed62b9817',
                scriptPubKey: '5120ba37ef408872d564fdb14630e938991f8b236cd7ea47aa06fe0aba7c1f701798',
                scriptPathControlBlocks: ['c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f']
            }
        },
        {
            given: {
                scripts: [
                    '2072ea6adcf1d371dea8fba1035a09f3d24ed5a059799bae114084130ee5898e69ac',
                    '202352d137f2f3ab38d1eaa976758873377fa5ebb817372c71e2c542313d4abda8ac'
                ]
            },
            expected: {
                root: '1819d235a1dae58aa5fd9f52a401efbfa8576169a35716c9da35c9c91cc37ab3',
                scriptPubKey: '51207b9e82fad4c1e9b12b9a90b729c2e82faa8719b3278c92fd4edf26ae2eea2cc8',
                scriptPathControlBlocks: [
                    'c0e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6fba982a91d4fc552163cb1c0da03676102d5b7a014304c01f0c77b2b8e888de1c'
                ]
            }
        },
        {
            given: {
                scripts: [
                    '2072ea6adcf1d371dea8fba1035a09f3d24ed5a059799bae114084130ee5898e69ac',
                    '202352d137f2f3ab38d1eaa976758873377fa5ebb817372c71e2c542313d4abda8ac',
                    '207337c0dd4253cb86f2c43a2351aadd82cccb12a172cd120452b9bb8324f2186aac'
                ]
            },
            expected: {
                root: '334c383095dddb4c090cfa0c20de4a802ffb3de876e406d802e0e04fa4072097',
                scriptPubKey: '512090232cdb89b1dd2b5014f4bcba9bcf55e8341bb816800b8e61f9d203bdcedb29',
                scriptPathControlBlocks: [
                    'c0e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6fba982a91d4fc552163cb1c0da03676102d5b7a014304c01f0c77b2b8e888de1ce6bdf7b991061435ac56d465d7364da29bbb7ee3a1aa751576fde591ea4869b5'
                ]
            }
        }
    ];

    it.each(testCases)('scriptPubKey test case %#', (testcase: Testcase) => {
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

        expect(sanityScriptPubKey.toString('hex')).toBe(testcase.expected.scriptPubKey);
        expect(scriptPubKey.toString('hex')).toBe(testcase.expected.scriptPubKey);
        // expect(scriptPubKey.toString('hex')).toBe(sanityScriptPubKey.toString('hex'));

        const sanityControlBlock = tapTree.getControlBlock(0);
        expect(sanityControlBlock.toString('hex')).toBe(testcase.expected.scriptPathControlBlocks[0]);

        const controlBlock = compressor.getControlBlock();
        expect(controlBlock.toString('hex')).toBe(testcase.expected.scriptPathControlBlocks[0]);
    });
});
