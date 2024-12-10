#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

data_dir="$(mktemp -d)"
snapshot_file="$(mktemp)"
cleanup() {
    rm -rf "$data_dir" "$snapshot_file"
}
#trap cleanup EXIT

snapshot() {
    bitcoin_cli stop
    sleep 1
    docker rm -f "$regtest_container_name"
    if [ "$1" = create ]; then
        tar -czf "$snapshot_file" -C "$data_dir" .
    elif [ "$1" = restore ]; then
        rm -rf "$data_dir"
        mkdir "$data_dir"
        tar -xzf "$snapshot_file" -C "$data_dir"
    else
        echo "Invalid argument: $1"
        exit 1
    fi
    npm run start-regtest -- "$data_dir"
}

broadcast() {
    npx ts-node ./src/agent/protocol-logic/broadcast-transaction.ts \
        --agent-id bitsnark_prover_1 --setup-id test_setup --name $1
}

npm run start-db
npm run start-regtest -- "$data_dir"
npm run emulate-setup

broadcast prover_stake
broadcast locked_funds

ts-node ./src/agent/protocol-logic/send-proof.ts bitsnark_prover_1 test_setup --fudge

snapshot create
