import { encodeWinternitz24, WOTS_NIBBLES, WotsType } from '../../src/agent/common/winternitz';
import { proofBigint } from '../../src/agent/common/constants';
import { Argument } from '../../src/agent/protocol-logic/argument';
import { getTransactionByName, twoDigits } from '../../src/agent/common/transactions';
import { parseInput } from '../../src/agent/protocol-logic/parser';
import { TransactionNames } from '../../src/agent/common/types';
import { initTemplatesForTest, setupId } from '../test-utils';
import { createUniqueDataId } from '../../src/agent/setup/wots-keys';

function makeSelectionPathUnparsed(selectionPath: number[]) {
    const spu: Buffer[][] = [];
    for (let i = 0; i < selectionPath.length; i++) {
        const tn = selectionPath[i];
        const unique = createUniqueDataId('salt', TransactionNames.SELECT + '_' + twoDigits(i), 0, 0, 0);
        spu.push(encodeWinternitz24(BigInt(tn), unique));
    }
    return spu;
}

async function init() {
    const argument = new Argument(setupId, 'salt', proofBigint);
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
    });

    it('break it', async () => {
        const { argument, selectionPath, argWitness } = await init();
        const templates = initTemplatesForTest().prover;
        const template = getTransactionByName(templates, TransactionNames.ARGUMENT);
        const decoded: bigint[][] = [];
        for (let i = 0; i < template.inputs.length; i++) {
            decoded.push(parseInput(templates, template.inputs[i], argWitness[i]));
        }
        expect(decoded.length).toBe(5);
    });
});
