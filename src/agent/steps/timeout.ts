import { Bitcoin } from "../../generator/step3/bitcoin";

export function createScriptTimeout(publicKey: bigint, blocks: number): Buffer {

    const bitcoin = new Bitcoin();
    bitcoin.verifySignature(publicKey);
    bitcoin.checkTimeout(blocks);
    if (!bitcoin.success) throw new Error('Failed');
    return bitcoin.programToBinary();
}
