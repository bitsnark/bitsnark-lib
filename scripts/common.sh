#!/bin/sh

bitcoin_container_name="${BITCOIN_CONTAINER_NAME:-bitcoin-node}"
postgres_container_name="${POSTGRES_CONTAINER_NAME:-postgres}"
bitcoin_data_dir="${BITCOIN_DATA_DIR:-/tmp/regtest_data}"
bitcoin_rpc_user="${BITCOIN_RPC_USER:-rpcuser}"
bitcoin_rpc_password="${BITCOIN_RPC_PASSWORD:-rpcpassword}"

# On macOS, "System Integrety Protection" clears the DYLD_FALLBACK_LIBRARY_PATH,
# which leaves the Python executable unable to find the secp256k1 library installed by Homebrew.
DYLD_FALLBACK_LIBRARY_PATH="$DYLD_FALLBACK_LIBRARY_PATH:/usr/local/lib:/opt/homebrew/lib"
export DYLD_FALLBACK_LIBRARY_PATH

if ! (return 0 2>/dev/null); then

    read -p "This script is intended to be sourced, not executed, continue? (y/N): " response
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    scripts_dir="$(dirname "$(realpath "$0")")"
fi

if [ -z "$INIT_CWD" ]; then
    read -p "This script is intended to be run with npm run-script, continue? (y/N): " response
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    [ "$scripts_dir" ] || scripts_dir="$(realpath .)"
    repo_root_dir="$(git -C "$scripts_dir" rev-parse --show-toplevel 2> /dev/null)"
    if [ -d "$repo_root_dir" ]; then
        echo "WARNING: Trying to cd to repo root dir: $repo_root_dir"
        cd "$repo_root_dir"
    else
        echo "WARNING: Couldn't find repo root dir, using current dir as root"
    fi
fi

if docker ps > /dev/null 2>&1; then
    docker_cmd=docker
elif sudo docker ps > /dev/null 2>&1; then
    docker_cmd='sudo docker'
else
    echo "Can't run docker commands, exiting."
    return 1
fi

if ! (mkdir -p "$bitcoin_data_dir" && test -w "$(dirname "$bitcoin_data_dir")"); then
    echo "Set BITCOIN_DATA_DIR to a directory that can be created and removed (not $bitcoin_data_dir)"
    return 1
fi

missing_packages() {
    pip freeze | sort > /tmp/bitsnark_venv_installed
    sort ./python/requirements.txt > /tmp/bitsnark_requirements
    missing_packages="$(comm -23 /tmp/bitsnark_requirements /tmp/bitsnark_venv_installed)"
    rm /tmp/bitsnark_venv_installed /tmp/bitsnark_requirements
    echo "$missing_packages"
}

venv_dir="./python/venv"
python_command="${PYTHON:-python3}"
activate_python_venv() {
    [ "$bitsnark_python_env" ] && return
    if ! [ -r "$venv_dir/bin/activate" ]; then
        echo "Creating virtual environment in $venv_dir"
        "$python_command" -m venv "$venv_dir"
    fi
    if ! . "$venv_dir/bin/activate"; then
        echo Failed to activate virtual environment
        return 1
    fi
    if [ "$(missing_packages)" ]; then
        pip install --upgrade pip
        pip install -r ./python/requirements.txt
        if [ "$(missing_packages)" ]; then
            echo "Failed to install all requirements"
            return 1
        fi
    fi
    bitsnark_python_env=1
    export bitsnark_python_env
}

conditionally_remove_container() {
    local container_name="$1"
    test -z "$($docker_cmd ps -aq -f name=$container_name)" && return 0
    echo "Container $container_name already exists."
    read -p "Do you want to remove the existing container? (y/n): " response
    if [ "$response" = y ] || [ "$response" = Y ]; then
        $docker_cmd rm -f "$container_name" && return 0
    fi
    echo Existing container was not removed - exiting.
    return 1
}

bitcoin_cli() {
    $docker_cmd exec "$bitcoin_container_name" bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}

generate_blocks() {
    [ "$1" -gt 0 ] 2>/dev/null && local count=$1 || count=1
    echo "Generating $count blocks"
    local address=$(bitcoin_cli getnewaddress)
    bitcoin_cli generatetoaddress $count $address
}

create_transaction() {
    local address=$1
    local amount=$2
    local fee=$3
    local utxo_idx=$4
    local utxo=$(bitcoin_cli listunspent 0 | jq -r "[.[] | select(.spendable == true)][$utxo_idx]")
    local txid=$(echo "$utxo" | jq -r '.txid')
    local vout=$(echo "$utxo" | jq -r '.vout')
    local utxo_amount=$(echo "$utxo" | jq -r '.amount')

    if [ -z "$txid" ]; then
        echo "No spendable UTXO found."
        return 1
    fi

    local change_amount=$(echo "$utxo_amount - $amount - $fee" | bc)
    local change_address=$(bitcoin_cli getnewaddress)

    local unsigned=$(bitcoin_cli createrawtransaction \
        "[{\"txid\":\"$txid\",\"vout\":$vout}]" \
        "{\"$address\":$amount,\"$change_address\":$change_amount}")
    local signed=$(bitcoin_cli signrawtransactionwithwallet "$unsigned" | jq -r '.hex')

    echo $signed
}

get_transactions_in_block() {
    local block_hash=$1
    local block_data=$(bitcoin_cli getblock $block_hash)
    local block_txids=$(echo "$block_data" | jq -r '.tx[1:][]')
    echo $block_txids
}

get_blocks() {
    local block_count=$(bitcoin_cli getblockcount)
    for height in $(seq 432 $block_count); do
        local block_hash=$(bitcoin_cli getblockhash $height)
        echo $block_hash
    done
}

get_transactions() {
    for block in $(get_blocks); do
        for txid in $(get_transactions_in_block $block); do
            echo "$block $txid"
        done
    done
}
