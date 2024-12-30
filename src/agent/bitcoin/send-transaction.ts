import { BitcoinNode } from '../common/bitcoin-node';

export async function sendTransaction(finalizedPsbt: { hex: string }): Promise<string> {
    const bitcoinNode = new BitcoinNode();
    const client = bitcoinNode.client;
    const rawTxHex = finalizedPsbt.hex;
    const txid = (await client.command('sendrawtransaction', rawTxHex)) as string;
    return txid;
}
