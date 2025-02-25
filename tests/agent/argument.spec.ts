import { encodeWinternitz24, WotsType, WOTS_OUTPUT } from '../../src/agent/common/winternitz';
import { proofBigint } from '../../src/agent/common/constants';
import { Argument } from '../../src/agent/protocol-logic/argument';
import { parseInput } from '../../src/agent/protocol-logic/parser';
import { initTemplatesForTest } from '../test-utils/test-utils';
import { createUniqueDataId } from '../../src/agent/setup/wots-keys';
import { getTemplateByName, twoDigits } from '../../src/agent/common/templates';
import { TemplateNames } from '../../src/agent/common/types';

const agentId = 'bitsnark_prover_1';
const setupId = 'test_setup';

function makeSelectionPathUnparsed(selectionPath: number[]) {
    const spu: Buffer[][] = [];
    for (let i = 0; i < selectionPath.length; i++) {
        const tn = selectionPath[i];
        const unique = createUniqueDataId(setupId, TemplateNames.SELECT + '_' + twoDigits(i), 0, 0, 0);
        spu.push(encodeWinternitz24(BigInt(tn), unique));
    }
    return spu;
}

async function init() {
    const argument = new Argument(agentId, setupId, proofBigint);
    const selectionPath = [1, 2, 3, 4, 5, 6];
    const argWitness = await argument.makeArgument(selectionPath, makeSelectionPathUnparsed(selectionPath));
    return { argument, selectionPath, argWitness };
}

describe('Argument', () => {
    it('make it', async () => {
        const { argWitness } = await init();

        expect(argWitness.length).toBe(9);
        expect(argWitness[0].length).toBe(7 * WOTS_OUTPUT[WotsType._24]);
        expect(argWitness[1].length).toBe(4 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[2].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[3].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[4].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[5].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[6].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[7].length).toBe(6 * WOTS_OUTPUT[WotsType._256_4_LP]);
        expect(argWitness[8].length).toBe(3 * WOTS_OUTPUT[WotsType._256_4_LP]);
    }, 1000000);

    it('break it', async () => {
        const { argWitness } = await init();
        const templates = initTemplatesForTest().prover;
        const template = getTemplateByName(templates, TemplateNames.ARGUMENT);
        const decoded: bigint[][] = [];
        for (let i = 0; i < template.inputs.length; i++) {
            decoded.push(parseInput(templates, template.inputs[i], argWitness[i]).map((wav) => wav.value));
        }
        expect(decoded.length).toBe(9);
        expect(decoded[0].length).toBe(7);
        expect(decoded[1].length).toBe(4);
        expect(decoded[2].length).toBe(6);
        expect(decoded[3].length).toBe(6);
        expect(decoded[4].length).toBe(6);
        expect(decoded[5].length).toBe(6);
        expect(decoded[6].length).toBe(6);
        expect(decoded[7].length).toBe(6);
        expect(decoded[8].length).toBe(3);
    }, 1000000);
});
