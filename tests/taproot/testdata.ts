export type Testcase = {
    given: {
        scripts: string[];
    };
    expected: {
        root: string;
        scriptPubKey: string;
        scriptPathControlBlocks: string[];
    };
};

export const internalPubkey = 'e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f';
export const testCases = [
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
    },
    {
        given: {
            scripts: ['0087', '5187', '5287', '5387', '5487']
        },
        expected: {
            root: '25f3c168e623516a205bfda9792707b1ba678e29c670bc99a5b237efb98bae88',
            scriptPubKey: '51206b0e0c47122063d5707d73925b8ebf6994d076ff35c557f27f45f879256d90cb',
            scriptPathControlBlocks: [
                'c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f6b13becdaf0eee497e2f304adcfa1c0c9e84561c9989b7f2b5fc39f5f90a60f6f544fe4afa992838d797c3b6d771c688bb73cd679e0e85b822ab71ac6c784c9f6c55251c400ed27c375fbe1c171508c4eec473ecd10cf88532b735cbe7e6f64c',
                'c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f8988aa92472aa752c39281a192217284d6b7c6cb6226917bcd14a187cd7d2ac3f544fe4afa992838d797c3b6d771c688bb73cd679e0e85b822ab71ac6c784c9f6c55251c400ed27c375fbe1c171508c4eec473ecd10cf88532b735cbe7e6f64c',
                'c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6f160bd30406f8d5333be044e6d2d14624470495da8a3f91242ce338599b2339312b702af5f508077b490b349c28e89c3fa9f50bc4e89a9845fb930b4a78af18966c55251c400ed27c375fbe1c171508c4eec473ecd10cf88532b735cbe7e6f64c',
                'c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6fed5af8352e2a54cce8d3ea326beb7907efa850bdfe3711cef9060c7bb5bcf59e2b702af5f508077b490b349c28e89c3fa9f50bc4e89a9845fb930b4a78af18966c55251c400ed27c375fbe1c171508c4eec473ecd10cf88532b735cbe7e6f64c',
                'c1e0dfe2300b0dd746a3f8674dfd4525623639042569d829c7f0eed9602d263e6fbf2c4bf1ca72f7b8538e9df9bdfd3ba4c305ad11587f12bbfafa00d58ad6051dbb3dcc2dee1c80f8c8b08eed51395b36ecb4305cdf88200b2acdec14b0c710aef57e223c32dd103a1302dcf54dc5394bf2a812596813d090883305451427d084'
            ]
        }
    }
];
