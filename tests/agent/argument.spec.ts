import { encodeWinternitz24, WOTS_NIBBLES, WotsType } from "../../src/agent/common/winternitz";
import { proofBigint } from "../../src/agent/common/constants";
import { Argument } from "../../src/agent/protocol-logic/argument";
import { createUniqueDataId, getTransactionByName } from "../../src/agent/common/transactions";
import { TransactionNames, twoDigits } from "../../src/agent/common/common";
import { readTemplates } from "../../src/agent/common/db";
import { parseInput } from "../../src/agent/protocol-logic/parser";

const agentId = 'bitsnark_verifier_1';
const setupId = 'test_setup';

function makeSelectionPathUnparsed(selectionPath: number[]) {
    const spu: Buffer[][] = [];
    for (let  i = 0; i < selectionPath.length; i++) {
        const tn = selectionPath[i];
        spu.push(encodeWinternitz24(BigInt(tn), createUniqueDataId(
            setupId, TransactionNames.SELECT + '_' + twoDigits(i),
            0,
            0,
            i
        )));
    }
    return spu;
}

async function init() {
    const argument = new Argument(setupId, proofBigint);
    const selectionPath = [ 1, 2, 3, 4, 5, 6 ];
    const argWitness = await argument.makeArgument(
        selectionPath,
        makeSelectionPathUnparsed(selectionPath)
    );
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
        const templates = await readTemplates(agentId, setupId);
        const template = getTransactionByName(templates, TransactionNames.ARGUMENT);
        const decoded: bigint[][] = [];
        for (let i = 0; i < template.inputs.length; i++) {
            decoded.push(parseInput(templates, template.inputs[i], argWitness[i]));
        }
        expect(decoded.length).toBe(5);
    });
});
