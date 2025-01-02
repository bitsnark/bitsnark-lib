#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

# returns error (and therefore exits) if container exists but not removed.
conditionally_remove_container $bitcoin_container_name

[ "$1" = persist ] || rm -rf "$bitcoin_data_dir"

printf Starting the Bitcoin node in regtest mode
if [ "$bitcoin_data_dir" ]; then
    mkdir -p "$bitcoin_data_dir"
    volume_mount="-v $bitcoin_data_dir:/home/bitcoin/.bitcoin"
    printf " with data directory $bitcoin_data_dir"
fi
echo ...

$docker_cmd run -d --name "$bitcoin_container_name" $volume_mount -p 18443:18443 -p 18444:18444 \
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
if [ $(bitcoin_cli getblockcount) -lt 432 ]; then
    echo Generating initial blocks and activating segwit...
    generate_blocks 432 > /dev/null
fi
