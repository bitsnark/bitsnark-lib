#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

bitcoin_data_dir="$1"

# returns error (and therefore exits) if container exists but not removed.
conditionally_remove_container $regtest_container_name

echo -n Starting the Bitcoin node in regtest mode
if [ "$bitcoin_data_dir" ]; then
    mkdir -p "$bitcoin_data_dir"
    volume_mount="-v $bitcoin_data_dir:/home/bitcoin/.bitcoin"
    echo -n " with data directory $bitcoin_data_dir"
fi
echo ...

sudo docker run -d --name "$regtest_container_name" $volume_mount -p 18443:18443 -p 18444:18444 \
    ruimarinho/bitcoin-core:latest -regtest \
    -rpcuser=rpcuser -rpcpassword=rpcpassword \
    -rpcallowip=0.0.0.0/0 -rpcbind=0.0.0.0
printf "Waiting for the Bitcoin node to start..."
while ! bitcoin_cli getblockchaininfo > /dev/null 2>&1; do
    printf .
    sleep 1
done
echo
echo Bitcoin node is up and running.

echo Creating and loading a wallet...
bitcoin_cli createwallet testwallet 2>/dev/null || true
bitcoin_cli loadwallet testwallet 2>/dev/null || true

# Segwit needs 432 blocks, at least according to this:
# https://gist.github.com/t4sk/0bc6b35a26998b9007d68f376a852636
echo Generating initial blocks and activating segwit...
bitcoin_cli generatetoaddress 432 $(bitcoin_cli getnewaddress) > /dev/null
