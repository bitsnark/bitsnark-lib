#!/bin/sh -e

# Check if the required parameter is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <txid>"
  exit 1
fi

# Assign the parameter to a variable
txid1=$1

# Define the bitcoin_cli function
bitcoin_cli() {
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}

# Check if the Bitcoin node is running
if ! docker ps | grep -q bitcoin-node; then
    echo "Bitcoin node is not running. Please start the Bitcoin node first."
    exit 1
fi

echo "Bitcoin node is up and running."

# Generate 5 demo transactions
echo "Generating 5 demo transactions..."
demo_txids=()
for i in $(seq 1 5)
do
    txid=$(bitcoin_cli sendtoaddress $(bitcoin_cli getnewaddress) 0.1)
    demo_txids+=($txid)
    echo "Demo Transaction $i ID: $txid"
done

# Generate the challenge transaction
echo "Creating the challenge transaction..."
challenge_tx=$(bitcoin_cli createrawtransaction \
  "[{\"txid\":\"$txid1\",\"vout\":0}]" \
  "{\"$(bitcoin_cli getnewaddress)\":0.1}")

signed_challenge_tx=$(bitcoin_cli signrawtransactionwithwallet "$challenge_tx")
challenge_txid=$(bitcoin_cli sendrawtransaction $(echo $signed_challenge_tx | jq -r '.hex'))
echo "Challenge Transaction ID: $challenge_txid"

# Generate a block to include the transactions
echo "Generating a block to include the transactions..."
block_hash=$(bitcoin_cli generatetoaddress 1 $(bitcoin_cli getnewaddress))
block_height=$(bitcoin_cli getblockcount)
echo "Block Hash: $block_hash"
echo "Block Height: $block_height"

# Print the list of new added transaction IDs
echo "List of new added transaction IDs:"
echo "Challenge Transaction ID: $challenge_txid"
for txid in "${demo_txids[@]}"
do
    echo "Demo Transaction ID: $txid"
done
