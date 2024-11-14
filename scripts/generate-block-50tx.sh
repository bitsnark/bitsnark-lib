#!/bin/sh -e
WALLET_NAME="testwallet"

echo 'Generating 50 transactions and a new block in regtest mode...'

bitcoin_cli() {
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword -rpcwallet=$WALLET_NAME "$@"
}

# Check if the Bitcoin node is running
if ! docker ps | grep -q bitcoin-node; then
    echo "Bitcoin node is not running. Please start the Bitcoin node first."
    exit 1
fi

echo "Bitcoin node is up and running."

echo "Creating and loading a wallet..."

if bitcoin_cli listwallets | grep -q "$WALLET_NAME"; then
    echo "Wallet $WALLET_NAME already exists."
else
    echo "Creating and loading a wallet..."
    bitcoin_cli createwallet "$WALLET_NAME"
fi

# Generate 50 mock transactions
echo "Generating 50 mock transactions..."
for i in $(seq 1 50)
do
    bitcoin_cli sendtoaddress $(bitcoin_cli getnewaddress) 0.1
done

# Generate a block to include the transactions
echo "Generating a block to include the transactions..."
bitcoin_cli generatetoaddress 1 $(bitcoin_cli getnewaddress)

echo "Done."
