import { Decasector } from '../../src/agent/setup/decasector';
import {
    createRefuteHashScriptTemplate,
    getRefutationDescriptor,
    getRefutationIndex,
    RefutationDescriptor,
    RefutationType,
    renderScriptTemplateWithKeys,
    totalRefutationHashOptions,
    totalRefutationProofs
} from '../../src/agent/final-step/refutation';
import { encodeWinternitz256_4_lp, getWinternitzPublicKeys, WotsType } from '../../src/agent/common/winternitz';
import { Bitcoin, executeProgram } from '../../src/generator/btc_vm/bitcoin';

describe('Refutation', () => {
    it.skip('index is created and interpreted correctly', async () => {
        const types = [RefutationType.INSTR, RefutationType.HASH];
        const decasector = new Decasector();

        let rd: RefutationDescriptor;
        for (const t of types) {
            for (let line = 0; line < decasector.total; line += 1000) {
                if (t == RefutationType.INSTR) {
                    rd = {
                        refutationType: t,
                        line
                    };
                    const index = getRefutationIndex(rd!);
                    const rd2 = getRefutationDescriptor(index);
                    expect(rd2).toEqual(rd!);
                } else {
                    for (let whichProof = 0; whichProof < totalRefutationProofs; whichProof++) {
                        for (let whichHashOption = 0; whichHashOption < totalRefutationHashOptions; whichHashOption++) {
                            rd = {
                                refutationType: t,
                                line,
                                whichProof,
                                whichHashOption
                            };
                            const index = getRefutationIndex(rd!);
                            const rd2 = getRefutationDescriptor(index);
                            expect(rd2).toEqual(rd!);
                        }
                    }
                }
            }
        }
    }, 10000);

    it('index is interpreted correctly', async () => {
        let rd: RefutationDescriptor;

        for (let index = 301000; index < 302000; index++) {
            rd = getRefutationDescriptor(index);
            if (rd.refutationType == RefutationType.HASH) {
                expect(rd.whichProof).toBeDefined();
                expect(rd.whichHashOption).toBeDefined();
            }
        }
    });

    it.skip('Refute hash script works', async () => {
        const scriptTemplate = await createRefuteHashScriptTemplate(Buffer.alloc(32));
        const keys = [0, 1, 2].map((v) => getWinternitzPublicKeys(WotsType._256_4_LP, `${v}`));
        const script = renderScriptTemplateWithKeys(scriptTemplate, keys);
        const witness = [0, 1, 2].map((v) => encodeWinternitz256_4_lp(BigInt(v), `${v}`));

        const bitcoin = new Bitcoin();
        bitcoin.throwOnFail = true;

        witness.flat().forEach((w) => bitcoin.addWitness(w));
        bitcoin.addWitness(Buffer.alloc(64));

        executeProgram(bitcoin, script);

        expect(bitcoin.success).toBeTruthy();
    });
});
