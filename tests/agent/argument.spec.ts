import { encodeWinternitz24, WOTS_NIBBLES, WotsType } from '../../src/agent/common/winternitz';
import { proofBigint } from '../../src/agent/common/constants';
import { Argument } from '../../src/agent/protocol-logic/argument';
import {
    createUniqueDataId,
    getSpendingConditionByInput,
    getTransactionByName,
    Transaction,
    twoDigits
} from '../../src/agent/common/transactions';
import { readTemplates } from '../../src/agent/common/db';
import { parseInput } from '../../src/agent/protocol-logic/parser';
import { TransactionNames } from '../../src/agent/common/types';

const setupId = 'test_setup';

// recursivation!
type Bufferheap = Buffer | Bufferheap[];
function deepCompare(a: Bufferheap, b: Bufferheap): boolean {
    if (a instanceof Buffer && b instanceof Buffer) return a.compare(b) == 0;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length != b.length) return false;
        return a.every((ta, i) => deepCompare(ta, b[i]));
    }
    return false;
}

function makeSelectionPathUnparsed(templates: Transaction[], selectionPath: number[]) {
    const spu: Buffer[][] = [];
    for (let i = 0; i < selectionPath.length; i++) {
        const tn = selectionPath[i];
        const template = getTransactionByName(templates, TransactionNames.SELECT + '_' + twoDigits(i));
        const unique = createUniqueDataId(setupId, template.transactionName, 0, 0, 0);
        spu.push(encodeWinternitz24(BigInt(tn), unique));
    }
    return spu;
}

async function init(agentId: string) {
    const templates = await readTemplates(agentId, setupId);
    const argument = new Argument(setupId, proofBigint);
    const selectionPath = [1, 2, 3, 4, 5, 6];
    const argWitness = await argument.makeArgument(selectionPath, makeSelectionPathUnparsed(templates, selectionPath));
    return { argument, selectionPath, argWitness };
}

describe('Argument', () => {
    it('make it', async () => {
        const agentId = 'bitsnark_prover_1';
        const { argument, selectionPath, argWitness } = await init(agentId);

        expect(argWitness.length).toBe(5);
        expect(argWitness[0].length).toBe(7 * WOTS_NIBBLES[WotsType._24]);
        expect(argument.checkIndex()).toBeTruthy();
        expect(argWitness[1].length).toBe(4 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[2].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[3].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[4].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
    });

    it('wots keys make sense', async () => {
        const agentId = 'bitsnark_prover_1';
        const templates = await readTemplates(agentId, setupId);
        const argumentTemplate = getTransactionByName(templates, TransactionNames.ARGUMENT);
        const asc = getSpendingConditionByInput(templates, argumentTemplate.inputs[0]);
        for (let i = 0; i < 6; i++) {
            const select = getTransactionByName(templates, TransactionNames.SELECT + '_' + twoDigits(i));
            const sc = getSpendingConditionByInput(templates, select.inputs[0]);
            expect(deepCompare(sc.wotsPublicKeys![0], asc.wotsPublicKeys![i])).toBeTruthy();
            if (i == 5) {
                expect(
                    deepCompare(select.outputs[0].spendingConditions[0].wotsPublicKeys![6], asc.wotsPublicKeys![6])
                ).toBeTruthy();
            }
        }
    });

    it('break it', async () => {
        const agentId = 'bitsnark_verifier_1';
        const { argument, selectionPath, argWitness } = await init(agentId);
        const templates = await readTemplates(agentId, setupId);
        const template = getTransactionByName(templates, TransactionNames.ARGUMENT);
        const decoded: bigint[][] = [];
        for (let i = 0; i < template.inputs.length; i++) {
            decoded.push(parseInput(templates, template.inputs[i], argWitness[i]));
        }
        expect(decoded.length).toBe(5);
    });
});
