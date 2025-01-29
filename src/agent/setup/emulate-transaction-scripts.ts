import { Bitcoin, executeProgram } from '../../generator/btc_vm/bitcoin';
import { AgentDb } from '../common/agent-db';
import { getSpendingConditionByInput } from '../common/templates';
import { SignatureType, Template } from '../common/types';

export function emulateTransactionScripts(templates: Template[]) {
    for (const template of templates) {
        console.log(template.name);

        for (const input of template.inputs) {
            console.log('input: ', input.index);

            const sc = getSpendingConditionByInput(templates, input);
            if (!sc.wotsSpec || !sc.script || !sc.exampleWitness) continue;

            const bitcoin = new Bitcoin();
            bitcoin.throwOnFail = true;

            for (const b of sc.exampleWitness!.flat()) bitcoin.newStackItem(b);
            // add the sigs
            if (sc.signatureType == SignatureType.BOTH) {
                bitcoin.newStackItem(Buffer.from(new Array(64)));
                bitcoin.newStackItem(Buffer.from(new Array(64)));
            } else if (sc.signatureType == SignatureType.PROVER || sc.signatureType == SignatureType.VERIFIER) {
                bitcoin.newStackItem(Buffer.from(new Array(64)));
            }

            try {
                executeProgram(bitcoin, sc.script!, false);
            } catch (e) {
                console.error(e);
                executeProgram(bitcoin, sc.script!, true);
            }
        }
    }
}

async function main() {
    const agentId = process.argv[2] ?? 'bitsnark_prover_1';
    const setupId = 'test_setup';
    const db = new AgentDb(agentId);
    const templates = await db.getTemplates(setupId);
    emulateTransactionScripts(templates);
}

if (require.main === module) {
    main().catch(console.error);
}
