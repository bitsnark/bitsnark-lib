import { Bitcoin, executeProgram } from '../../../src/generator/btc_vm/bitcoin';
import { AgentDb } from '../common/agent-db';
import { proofBigint } from '../common/constants';
import { getSpendingConditionByInput, getTemplateByName, twoDigits } from '../common/templates';
import { TemplateNames } from '../common/types';
import { encodeWinternitz24 } from '../common/winternitz';
import { generateProcessSelectionPath } from '../setup/generate-scripts';
import { createUniqueDataId } from '../setup/wots-keys';
import { Argument } from './argument';

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
    const argument = new Argument('bitsnark_prover_1', setupId, proofBigint);
    const selectionPath = [1, 2, 3, 4, 5, 6];
    const argWitness = await argument.makeArgument(selectionPath, makeSelectionPathUnparsed(selectionPath));
    return { argument, selectionPath, argWitness };
}

async function main() {
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    const argumentTemplate = getTemplateByName(templates, TemplateNames.ARGUMENT);

    const script0a = generateProcessSelectionPath(getSpendingConditionByInput(templates, argumentTemplate.inputs[0]));
    const script0b = argumentTemplate.inputs[0].script!;

    console.log('scripts equal: ', script0a.compare(script0b) == 0);

    const { argWitness } = await init();
    const bitcoin = new Bitcoin();
    argWitness[0].forEach((b) => bitcoin.addWitness(b));
    [Buffer.alloc(64), Buffer.alloc(64)].forEach((b) => bitcoin.addWitness(b));
    bitcoin.throwOnFail = true;
    executeProgram(bitcoin, script0a);
    expect(bitcoin.fail).toBeFalsy();
}

if (require.main === module) {
    main().catch((error) => {
        throw error;
    });
}
