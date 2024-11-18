#!/bin/sh -e
setup=test_setup
prover=bitsnark_prover_1
verifier=bitsnark_verifier_1
regtest_container=bitcoin-node
rpc_user=rpcuser
rpc_password=rpcpassword

script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
[ "$VIRTUAL_ENV" ] || exec "$repo_root_dir/python/run-in-venv.sh" "$0" "$@"
cd "$repo_root_dir/python"

bitcoin_cli() {
    docker exec "$regtest_container" bitcoin-cli -regtest -rpcuser="$rpc_user" -rpcpassword="$rpc_password" "$@"
}

current_block_height() {
    bitcoin_cli getblockchaininfo | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf-8')).blocks"
}

mine_blocks() {
    local n="$1"
    local before=$(current_block_height)
    echo -n Mining "$n" blocks... 1>&2
    bitcoin_cli -generate "$n" > /dev/null
    echo "$before -> $(current_block_height)" 1>&2
}

fake_fund() {
    local agent="$1"
    local name="$2"
    echo Fake-funding and sending transaction "$name"... 1>&2
    local txid=$(python -m bitsnark.cli fund_and_send \
        --setup-id "$setup" --agent-id "$agent" --name "$name" 2>&1 | \
            grep -o ': [0-9a-f]\{64\}$' | cut -c3-)
    echo $txid
}

spend_with_condition() {
    local agent="$1"
    local name="$2"
    local txid="$3"
    local output="$4"
    local spending_condition="$5"
    echo Spending output "$output" with spending condition "$spending_condition"... | 1>&2
    python -m bitsnark.cli spend --setup-id "$setup" --agent-id "$agent" \
        --name "$name" --prevout "$txid:$output" --spending-condition "$spending_condition"
}

proof=$(fake_fund "$prover" proof)
mine_blocks 100
echo Checking proof uncontested timeout
spend_with_condition "$prover" proof "$proof" 0 0
echo Success
