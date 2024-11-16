#!/bin/sh -e

source ./scripts/docker-utils.sh

CONTAINER_NAME="bitcoin-node"

# returns 1 if container exists but not removed
prompt_delete_container $CONTAINER_NAME

echo "Starting the Bitcoin node in regtest mode..."

docker run -d --name $CONTAINER_NAME -v bitcoin-data:/bitcoin/.bitcoin -p 18443:18443 -p 18444:18444 ruimarinho/bitcoin-core:latest \
    -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword -fallbackfee=0.0002  -rpcallowip=0.0.0.0/0 -rpcbind=0.0.0.0

bitcoin_cli() {
    docker exec $CONTAINER_NAME bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}

printf "Waiting for the Bitcoin node to start..."

while ! bitcoin_cli getblockchaininfo > /dev/null 2>&1; do
    printf .
    sleep 1
done

echo

echo "Bitcoin node is up and running."
docker logs $CONTAINER_NAME

echo "Creating and loading a wallet..."
bitcoin_cli createwallet "testwallet"

# Segwit needs 432 blocks, at least according to this:
# https://gist.github.com/t4sk/0bc6b35a26998b9007d68f376a852636
echo "Generating initial blocks and activating segwit..."
bitcoin_cli generatetoaddress 432 $(bitcoin_cli getnewaddress) > /dev/null

echo "Generating mock transactions..."
for i in {1..10}
do
    bitcoin_cli sendtoaddress $(bitcoin_cli getnewaddress) 0.1
done

echo "Generating another block to include the transactions..."
bitcoin_cli generatetoaddress 1 $(bitcoin_cli getnewaddress)
