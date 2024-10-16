#!/bin/sh -e

echo "Starting the Bitcoin node in regtest mode..."
docker run --rm -d --name bitcoin-node -v bitcoin-data:/bitcoin/.bitcoin -p 18443:18443 -p 18444:18444 ruimarinho/bitcoin-core:latest \
    -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword -fallbackfee=0.0002  -rpcallowip=0.0.0.0/0 -rpcbind=0.0.0.0

bitcoin_cli() {
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}

printf "Waiting for the Bitcoin node to start..."

while ! bitcoin_cli getblockchaininfo > /dev/null 2>&1; do
    printf .
    sleep 1
done

echo

echo "Bitcoin node is up and running."
docker logs bitcoin-node

echo "Creating and loading a wallet..."
bitcoin_cli createwallet "testwallet"

echo "Generating initial blocks..."
bitcoin_cli generatetoaddress 101 $(bitcoin_cli getnewaddress)

echo "Generating mock transactions..."
for i in {1..10}
do
    bitcoin_cli sendtoaddress $(bitcoin_cli getnewaddress) 0.1
done

echo "Generating another block to include the transactions..."
bitcoin_cli generatetoaddress 1 $(bitcoin_cli getnewaddress)
