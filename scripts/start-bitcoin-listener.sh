#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

# TODO: Move this loop to the listener itself, and take a single agent ID as an argument.
while sleep 1; do
    ./node_modules/.bin/ts-node ./src/agent/listener/bitcoin-listener.ts
done
