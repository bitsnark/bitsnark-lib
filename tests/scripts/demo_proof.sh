#!/bin/bash

# Define a helper function for Bitcoin CLI commands in Docker
bitcoin_cli() {
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}

# Ensure jq is available
if ! command -v jq &>/dev/null; then
    echo "Error: jq is not installed. Please install it with 'sudo apt install jq' or equivalent."
    exit 1
fi

# Step 1: Generate funds and ensure the wallet is loaded
echo "Generating blocks to fund the wallet..."
address=$(bitcoin_cli getnewaddress)
bitcoin_cli generatetoaddress 101 "$address"

# Step 2: Define unique redeem scripts and derive their P2SH addresses
redeemScript1="51"       # OP_TRUE
redeemScript2="5151"     # OP_TRUE followed by a NOP operation

scriptPubKey1=$(bitcoin_cli decodescript "$redeemScript1" | jq -r '.p2sh')
scriptPubKey2=$(bitcoin_cli decodescript "$redeemScript2" | jq -r '.p2sh')

if [[ -z "$scriptPubKey1" || -z "$scriptPubKey2" ]]; then
    echo "Error: Failed to generate scriptPubKey addresses."
    exit 1
fi

echo "Redeem Script 1: $redeemScript1"
echo "ScriptPubKey 1 (P2SH Address): $scriptPubKey1"
echo "Redeem Script 2: $redeemScript2"
echo "ScriptPubKey 2 (P2SH Address): $scriptPubKey2"

# Step 3: Select a UTXO to spend
echo "Selecting a UTXO..."
utxo=$(bitcoin_cli listunspent | jq -c '.[0]')
txid=$(echo "$utxo" | jq -r '.txid')
vout=$(echo "$utxo" | jq -r '.vout')
amount=$(echo "$utxo" | jq -r '.amount')

if [[ -z "$txid" || -z "$vout" || -z "$amount" ]]; then
    echo "Error: No suitable UTXO found."
    exit 1
fi

echo "Using UTXO: txid=$txid, vout=$vout, amount=$amount"

# Step 4: Calculate amounts for the two outputs
amount1=$(printf "%.8f" "$(echo "$amount * 0.5" | bc)")
amount2=$(printf "%.8f" "$(echo "$amount * 0.5 - 0.0001" | bc)")

# Step 5: Create the first transaction with two outputs
echo "Creating the first transaction..."
tx1=$(bitcoin_cli createrawtransaction \
  "[{\"txid\":\"$txid\",\"vout\":$vout}]" \
  "{\"$scriptPubKey1\":$amount1,\"$scriptPubKey2\":$amount2}")

# Sign and broadcast the first transaction
echo "Signing the first transaction..."
signed_tx1=$(bitcoin_cli signrawtransactionwithwallet "$tx1" | jq -r '.hex')

if [[ -z "$signed_tx1" ]]; then
    echo "Error: Failed to sign the transaction."
    exit 1
fi

txid1=$(bitcoin_cli sendrawtransaction "$signed_tx1")

if [[ -z "$txid1" ]]; then
    echo "Error: Failed to send the first transaction."
    exit 1
fi

echo "First Transaction ID: $txid1"

# Step 6: Generate a block to confirm the first transaction
echo "Generating a block to confirm the first transaction..."
bitcoin_cli generatetoaddress 1 "$address"

echo "First transaction confirmed in the blockchain."
