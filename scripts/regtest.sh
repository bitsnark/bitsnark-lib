#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

# returns error (and therefore exits) if container exists but not removed.
conditionally_remove_container $bitcoin_container_name

[ "$1" = persist ] || rm -rf "$bitcoin_data_dir"

echo Starting Bitcoin node...
# FIXME: We accept non standard transactions because our transactions are larger than the regtest limit.
# We need to find out what's the real limit with real miners on mainnet (and testnet) and set it to that.
$docker_cmd run -d --name "$bitcoin_container_name" \
    -v $bitcoin_data_dir:/home/bitcoin/.bitcoin \
    -p 18443:18443 -p 18444:18444 \
    ruimarinho/bitcoin-core:latest -regtest \
    -acceptnonstdtxn=1 \
    -rpcuser="$bitcoin_rpc_user" -rpcpassword="$bitcoin_rpc_password" \
    -rpcallowip=0.0.0.0/0 -rpcbind=0.0.0.0 -reindex=1

printf "Waiting for the Bitcoin node to start..."
while ! bitcoin_cli getblockchaininfo > /dev/null 2>&1; do
    printf .
    sleep 1
done
echo
echo Bitcoin node is up.

echo Creating and loading a wallet...
bitcoin_cli createwallet testwallet 2>/dev/null || true
bitcoin_cli loadwallet testwallet 2>/dev/null || true

# Segwit needs 432 blocks, at least according to this:
# https://gist.github.com/t4sk/0bc6b35a26998b9007d68f376a852636
if [ $(bitcoin_cli getblockcount) -lt 432 ]; then
    echo Generating initial blocks and activating segwit...
    generate_blocks 432 > /dev/null
fi
echo Bitcoin node is ready.
