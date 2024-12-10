import { encodeWinternitz24, WOTS_NIBBLES, WotsType } from '../../src/agent/common/winternitz';
import { proofBigint } from '../../src/agent/common/constants';
import { Argument } from '../../src/agent/protocol-logic/argument';
import { parseInput } from '../../src/agent/protocol-logic/parser';
import { initTemplatesForTest } from '../test-utils/test-utils';
import { createUniqueDataId } from '../../src/agent/setup/wots-keys';
import { getTemplateByName, twoDigits } from '../../src/agent/common/templates';
import { TemplateNames } from '../../src/agent/common/types';
import { TEST_WOTS_SALT } from '../../src/agent/setup/emulate-setup';

function makeSelectionPathUnparsed(selectionPath: number[]) {
    const spu: Buffer[][] = [];
    for (let i = 0; i < selectionPath.length; i++) {
        const tn = selectionPath[i];
        const unique = createUniqueDataId(TEST_WOTS_SALT, TemplateNames.SELECT + '_' + twoDigits(i), 0, 0, 0);
        spu.push(encodeWinternitz24(BigInt(tn), unique));
    }
    return spu;
}

async function init() {
    const argument = new Argument(TEST_WOTS_SALT, proofBigint);
    const selectionPath = [1, 2, 3, 4, 5, 6];
    const argWitness = await argument.makeArgument(selectionPath, makeSelectionPathUnparsed(selectionPath));
    return { argument, selectionPath, argWitness };
}

describe('Argument', () => {
    it('make it', async () => {
        const { argument, selectionPath, argWitness } = await init();

        expect(argWitness.length).toBe(5);
        expect(argWitness[0].length).toBe(7 * WOTS_NIBBLES[WotsType._24]);
        expect(argument.checkIndex()).toBeTruthy();
        expect(argWitness[1].length).toBe(4 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[2].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[3].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
        expect(argWitness[4].length).toBe(11 * WOTS_NIBBLES[WotsType._256_4]);
    }, 10000);

    it('break it', async () => {
        const { argument, selectionPath, argWitness } = await init();
        const templates = initTemplatesForTest().prover;
        const template = getTemplateByName(templates, TemplateNames.ARGUMENT);
        const decoded: bigint[][] = [];
        for (let i = 0; i < template.inputs.length; i++) {
            decoded.push(parseInput(templates, template.inputs[i], argWitness[i]));
        }
        expect(decoded.length).toBe(5);
    });
});
