import * as bitcoinlib from 'bitcoinjs-lib';
import { readTransactions } from './db';
import { Input, Transaction } from './transactions-new';


// TODO

export function generateTransaction(template: Transaction) {
    const btctx = new bitcoinlib.Transaction();
    for (const input of template.inputs) {
        btctx.addInput(input.transactionId!, input.outputIndex);
    }
    for (const output of template.outputs) {
        btctx.addOutput(output.taprootKey!, Number(output.amount));
    }
    btctx.getId
}


// TODO

export function parseTransaction(rawTransaction: Buffer) {

    // Parse the transaction
    const tx = bitcoinlib.Transaction.fromHex(rawTransaction.toString('hex'));

    // Iterate over each input and extract the witness data
    tx.ins.forEach((input, index) => {
        console.log(`Input #${index + 1}:`);

        if (input.witness.length > 0) {
            console.log('Witness data:');
            input.witness.forEach((witnessItem, witnessIndex) => {
                console.log(`  Witness #${witnessIndex + 1}: ${witnessItem.toString('hex')}`);
            });
        } else {
            console.log('No witness data');
        }
    });
}

// TODO

export async function readTransactionsFromBitcoin(agentId: string) {

    const transactions: Transaction[] = await await readTransactions(agentId);
    const txIds = transactions.map(t => t.txId);

    // TODO get from bitcoin
}

