import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
const Client = require('bitcoin-core');

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.regtest;

// Bitcoin Core RPC client setup
const client = new Client({
  network: 'regtest',
  username: 'rpcuser',
  password: 'rpcpassword',
  host: '127.0.0.1',
  port: 18443
});

async function createAndSendTransaction() {
  // Generate a key pair
  const keyPair = ECPair.fromPrivateKey(Buffer.from('023c8f4b28d12af26c29b4765dd33c4a3c0b685ab1a47a9fcfe9b2117ad011ea', 'hex')); //.makeRandom({ network });
  const pubkey = keyPair.publicKey;
  const prvkey = keyPair.privateKey;
  const p2wpkhAddress = bitcoin.payments.p2wpkh({ pubkey, network }).address;

  console.log('private key: ', prvkey?.toString('hex'));
  console.log('p2wpkhAddress: ', p2wpkhAddress!);

  // Create a Taproot script
  const scriptTree = {
    output: bitcoin.script.compile([
      bitcoin.opcodes.OP_1,
      bitcoin.crypto.hash160(pubkey)
    ])
  };

  const { address, output } = bitcoin.payments.p2tr({
    internalPubkey: pubkey.slice(1, 33),
    scriptTree,
    network
  });


  // Create the transaction
  const psbt = new bitcoin.Psbt({ network });

  // Fetch an unspent transaction output (UTXO) from the Bitcoin Core node
  const utxos = await client.listUnspent(1, 9999999, []);
  if (utxos.length === 0) {
    throw new Error('No available UTXOs');
  }

  const utxo = utxos[0];

  // Add input
  psbt.addInput({
    hash: utxo.txid,
    index: utxo.vout,
    witnessUtxo: {
      script: output!,
      value: Math.round(utxo.amount * 100000000) // Convert BTC to satoshis
    },
    tapInternalKey: pubkey.slice(1, 33),
    tapMerkleRoot: bitcoin.crypto.taggedHash('TapLeaf', scriptTree.output)
  });

  // Add output (replace with your actual output data)
  const recipientAddress = 'recipient_address';
  const sendAmount = 90000; // Amount in satoshis
  psbt.addOutput({
    address: recipientAddress,
    value: sendAmount
  });

  // Calculate and add change output if necessary
  const fee = 1000; // Set an appropriate fee
  const changeAmount = Math.round(utxo.amount * 100000000) - sendAmount - fee;
  if (changeAmount > 0) {
    psbt.addOutput({
      address: address!, // Send change back to our address
      value: changeAmount
    });
  }

  // Sign the transaction
  psbt.signInput(0, keyPair);

  // Finalize and extract the transaction
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction();

  console.log('Transaction ID:', tx.getId());
  console.log('Raw transaction:', tx.toHex());

  // Send the transaction
  const txid = await client.sendRawTransaction(tx.toHex());
  console.log('Transaction sent. TXID:', txid);

}

createAndSendTransaction();