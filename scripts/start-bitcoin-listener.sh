#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

./node_modules/.bin/ts-node ./src/agent/listener/bitcoin-listener.ts "$@"
