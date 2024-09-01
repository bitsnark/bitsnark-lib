import { agentConf } from "../../../agent.conf";
import { Runner } from "../../generator/step1/vm/runner";
import { Bitcoin } from "../../generator/step3/bitcoin";
import { getSavedStep1, TransactionInfo } from "../common";
import { internalPublicKey } from "../public-key";
import { SimpleTapTree } from "../simple-taptree";
import { createScriptTimeout } from "./timeout";

export function createChallengeTx(proverPublicKey: bigint, verifierPublicKey: bigint): TransactionInfo {

    const blocks = agentConf.timeoutBlocks ?? 5;
    const bitcoin = new Bitcoin();

    bitcoin.verifySignature(proverPublicKey);
    bitcoin.verifySignature(verifierPublicKey);

    const scripts: Buffer[] = [ 
        bitcoin.programToBinary(),
        createScriptTimeout(verifierPublicKey, blocks)
    ];

    const stt = new SimpleTapTree(internalPublicKey, scripts);
    return {
        scripts,
        taprootAddress: stt.getAddress(),
        controlBlocks: [ stt.getControlBlock(0), stt.getControlBlock(1) ],
        wotsPublicKeys: []
    };
}
