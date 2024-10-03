import { agentConf } from "../../../agent.conf";
import { getLamportPublicKeys } from "../../encoding/lamport";
import { getWinternitzPublicKeys256 } from "../../encoding/winternitz";
import { Bitcoin } from "../../generator/step3/bitcoin";
import { TransactionInfo, getEncodingIndexForPat, ProtocolStep, getEncodingIndexForVic, numToStr2Digits } from "../common";
import { internalPublicKey } from "../public-key";
import { SimpleTapTree } from "../simple-taptree";
import { createScriptTimeout } from "./timeout";


export function createStep1PatPartTx(iteration: number, setupId: string, proverPublicKey: bigint, verifierPublicKey: bigint): TransactionInfo {

    const blocks = agentConf.timeoutBlocks ?? 5;
    const bitcoin = new Bitcoin();

    bitcoin.verifySignature(proverPublicKey);
    bitcoin.verifySignature(verifierPublicKey);

    const chunkIndex = getEncodingIndexForPat(ProtocolStep.STEP1, iteration, 0);
    bitcoin.winternitzCheck256(
        [ bitcoin.addWitness(0n) ],
        getWinternitzPublicKeys256(chunkIndex));

    const scripts: Buffer[] = [
        bitcoin.programToBinary(),
        createScriptTimeout(proverPublicKey, blocks)
    ];

    const stt = new SimpleTapTree(internalPublicKey, scripts);
    return {
        desc: 'STEP1_' +  iteration,
        setupId,
        scripts,
        taprootAddress: stt.getScriptPubkey(),
        controlBlocks: [stt.getControlBlock(0), stt.getControlBlock(1)],
        wotsPublicKeys: []
    };
}

export function createStep1VicPartTx(iteration: number, setupId: string, proverPublicKey: bigint, verifierPublicKey: bigint): TransactionInfo {

    const blocks = agentConf.timeoutBlocks ?? 5;
    const bitcoin = new Bitcoin();

    bitcoin.verifySignature(proverPublicKey);
    bitcoin.verifySignature(verifierPublicKey);

    const chunkIndex = getEncodingIndexForVic(ProtocolStep.STEP1, iteration);
    bitcoin.lamportDecodeBit(
        bitcoin.newStackItem(0n),
        bitcoin.addWitness(0n),
        getLamportPublicKeys(chunkIndex, 1)[0]);

    const scripts: Buffer[] = [
        bitcoin.programToBinary(),
        createScriptTimeout(verifierPublicKey, blocks)
    ];

    const stt = new SimpleTapTree(internalPublicKey, scripts);
    return {
        desc: `STEP1_V_${numToStr2Digits(iteration)}`,
        setupId,
        scripts,
        taprootAddress: stt.getScriptPubkey(),
        controlBlocks: [stt.getControlBlock(0), stt.getControlBlock(1)],
        wotsPublicKeys: []
    };
}
