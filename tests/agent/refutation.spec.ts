import { Decasector } from '../../src/agent/setup/decasector';
import {
    getRefutationDescriptor,
    getRefutationIndex,
    RefutationDescriptor,
    RefutationType,
    scriptTotalLines,
    totalRefutationHashes,
    totalRefutationProofs
} from '../../src/agent/final-step/refutation';

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
                        for (let whichHash = 0; whichHash < totalRefutationHashes; whichHash++) {
                            rd = {
                                refutationType: t,
                                line,
                                whichProof,
                                whichHash
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
                expect(rd.whichHash).toBeDefined();
            }
        }
    });
});
