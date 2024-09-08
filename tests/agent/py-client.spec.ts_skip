import { runPythonScript, createPresignedTransaction } from '../../src/agent/py-client';
import { createInitialTx  } from '../../src/agent/steps/initial';


describe('runPythonScript', () => {
    it('runs a python script', async () => {
        const ret = await runPythonScript('bitsnark.scripts.helloworld', {});
        expect(ret).toEqual({
            hello: "world",
        });
    });

    it('runs a python script with input', async () => {
        const ret = await runPythonScript('bitsnark.scripts.helloworld', {
            greeting: "bitsnark",
        });
        expect(ret).toEqual({
            hello: "bitsnark",
        });
    });
});

// from bitcointx.core.key import CKey
// pat_priv = CKey(b'PATPATPATPATPATPATPATPATPATPAT\xaa\xbb')
// pat_priv.hex()
const PROVER_PRIVKEY = 0x504154504154504154504154504154504154504154504154504154504154aabbn;
// pat.xonly_pub.hex()
const PROVER_XONLY_PUBKEY = 0x8ed7e71faf0309be3bf2f128f1e117c4d96365073ef8c15c6295d3efbe7ebd55n;

// vic_priv = CKey(b'VICVICVICVICVICVICVICVICVICVIC\xee\xff')
// vic_priv.hex()
const VERIFIER_PRIVKEY = 0x564943564943564943564943564943564943564943564943564943564943eeffn;
// vic_priv.xonly_pub.hex()
const VERIFIER_XONLY_PUBKEY = 0x38fea39a5f9cfd0fb91234e64bbffb3c5ee602b02401aabf89e11592d2c103f0n;

describe('createPresignedTransaction', () => {
    it('creates a presigned transaction', async () => {
        const dummyPrevTx = createInitialTx(VERIFIER_XONLY_PUBKEY, PROVER_XONLY_PUBKEY);
        const tx = createInitialTx(PROVER_XONLY_PUBKEY, VERIFIER_XONLY_PUBKEY);

        const ret = await createPresignedTransaction({
            inputs: [
                {
                    txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16', // Dummy
                    vout: 0,  // TODO: placeholder
                    spentOutput: {
                        scriptPubKey: dummyPrevTx.scriptPubKey,
                        value: 133700000000n // TODO: placeholder
                    }
                },
            ],
            schnorrPrivateKey: PROVER_PRIVKEY,
            executionScript: tx.scripts[0],
            outputValue: 133700000000n, // TODO: placeholder! fees need to be subtracted
            outputScriptPubKey: tx.scriptPubKey,
        });

        // TODO: these values are dummy, test that they make sense
        expect(ret).toEqual({
            txid: "35b32674c254ca3972c3a88aea0dd293c6c81abda4aa94f376d690a6a1e78a73",
            executionSignature: "a6d4ce02c683b0c3541f4128526cc892fd5ea30dca6e95f7dadede89157dc42b57f3031a49f566fcc6d1a709e3b180deca6dfd1eab692805f0bf696aea417fdc",
            transaction: Buffer.from([
                2, 0, 0, 0, 1, 22, 158, 30, 131, 233, 48, 133, 51, 145, 188, 111, 53, 246, 5, 198, 117, 76, 254, 173,
                87, 207, 131, 135, 99, 157, 59, 64, 150, 197, 79, 24, 244, 0, 0, 0, 0, 0, 255, 255, 255, 255, 1, 0, 25,
                36, 33, 31, 0, 0, 0, 34, 81, 32, 220, 171, 255, 52, 114, 236, 159, 11, 170, 213, 196, 180, 86, 153, 73,
                104, 178, 13, 62, 106, 183, 238, 62, 246, 212, 112, 91, 173, 111, 95, 167, 231, 0, 0, 0, 0,
            ]),
        })
    });
});
