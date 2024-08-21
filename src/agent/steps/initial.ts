import { agentConf } from '../../../agent.conf';
import { Bitcoin } from '../../../src/generator/step3/bitcoin';
import { bufferToBigints256BE } from '../../encoding/encoding';
import { encodeWinternitz256, getWinternitzPublicKeys256 } from '../../encoding/winternitz';
import { getEncodingIndexForPat, ProtocolStep, ScriptAndKeys, TransactionInfo } from '../common';
import { proof, publicSignals } from '../proof';
import { internalPublicKey } from '../public-key';
import { SimpleTapTree } from '../simple-taptree';
import { createScriptTimeout } from './timeout';

function createScriptInitial(proverPublicKey: bigint, verifierPublicKey: bigint): ScriptAndKeys { 

    const bitcoin = new Bitcoin();
    const publicKeys: bigint[] = [];
    const encodedWitness: bigint[] = [];
    [
        ...proof.pi_a,
        proof.pi_b[0][1], proof.pi_b[0][0], proof.pi_b[1][1], proof.pi_b[1][0],
        ...proof.pi_c,
        ...publicSignals
    ]
        .map(s => BigInt(s))
        .forEach((w, i) => {
            const chunkIndex = getEncodingIndexForPat(ProtocolStep.INITIAL, 0, i);
            const buffer = encodeWinternitz256(w, chunkIndex);
            encodedWitness.push(...bufferToBigints256BE(buffer));
            publicKeys.push(...getWinternitzPublicKeys256(chunkIndex));
        });

    bitcoin.verifySignature(proverPublicKey);
    bitcoin.verifySignature(verifierPublicKey);

    bitcoin.checkInitialTransaction(
        encodedWitness.map(n => bitcoin.addWitness(n)),
        publicKeys);

    if (!bitcoin.success) throw new Error('Failed');
    return { script: bitcoin.programToBinary(), publicKeys };
}

export function createInitialTx(proverPublicKey: bigint, verifierPublicKey: bigint): TransactionInfo {

    const blocks = agentConf.timeoutBlocks ?? 5;
    const initialScriptAndKeys = createScriptInitial(proverPublicKey, verifierPublicKey);
    const scripts = [
        initialScriptAndKeys.script,
        createScriptTimeout(proverPublicKey, blocks)
    ];
    const stt = new SimpleTapTree(internalPublicKey, scripts);
    return {
        scripts,
        taprootAddress: stt.getAddress(),
        controlBlocks: [ stt.getControlBlock(0), stt.getControlBlock(1) ],
        wotsPublicKeys: initialScriptAndKeys.publicKeys
    };
}
