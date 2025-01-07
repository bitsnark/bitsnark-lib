import { Decasector } from '../../src/agent/setup/decasector';
import {
    getRefutationDescriptor,
    getRefutationIndex,
    RefutationDescriptor,
    RefutationType,
    totalRefutationHashes,
    totalRefutationProofs
} from '../../src/agent/final-step/refutation';

describe('Refutation', () => {
    it('index is created and interpreted correctly', async () => {
        const types = [RefutationType.INSTR, RefutationType.HASH];
        const decasector = new Decasector();

        let rd: RefutationDescriptor;
        for (const t of types) {
            for (let line = 0; line < decasector.total; line += 1000) {
                if (t == RefutationType.INSTR) {
                    rd = {
                        refutationType: t,
                        line,
                        totalLines: decasector.total
                    };
                    const index = getRefutationIndex(rd!);
                    const rd2 = getRefutationDescriptor(decasector, index);
                    expect(rd2).toEqual(rd!);
                } else {
                    for (let whichProof = 0; whichProof < totalRefutationProofs; whichProof++) {
                        for (let whichHash = 0; whichHash < totalRefutationHashes; whichHash++) {
                            rd = {
                                refutationType: t,
                                line,
                                whichProof,
                                whichHash,
                                totalLines: decasector.total
                            };
                            const index = getRefutationIndex(rd!);
                            const rd2 = getRefutationDescriptor(decasector, index);
                            expect(rd2).toEqual(rd!);
                        }
                    }
                }
            }
        }
    }, 10000);

    it('index is interpreted correctly', async () => {
        const decasector = new Decasector();
        let rd: RefutationDescriptor;

        for (let index = 301000; index < 302000; index++) {
            rd = getRefutationDescriptor(decasector, index);
            if (rd.refutationType == RefutationType.HASH) {
                expect(rd.whichProof).toBeDefined();
                expect(rd.whichHash).toBeDefined();
            }
        }
    });
});
