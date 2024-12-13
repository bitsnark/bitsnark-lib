#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

data_dir="$(mktemp -d)"
snapshot_file="$(mktemp)"
cleanup() {
    rm -rf "$data_dir" "$snapshot_file"
}
trap cleanup EXIT

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

create_transaction() {
    address=$1
    amount=$2
    fee=$3
    utxo_idx=$4
    utxo=$(bitcoin_cli listunspent 0 | jq -r "[.[] | select(.spendable == true)][$utxo_idx]")
    txid=$(echo "$utxo" | jq -r '.txid')
    vout=$(echo "$utxo" | jq -r '.vout')
    utxo_amount=$(echo "$utxo" | jq -r '.amount')

    if [ -z "$txid" ]; then
        echo "No spendable UTXO found."
        return 1
    fi

    change_amount=$(echo "$utxo_amount - $amount - $fee" | bc)
    change_address=$(bitcoin_cli getnewaddress)

    unsigned=$(bitcoin_cli createrawtransaction \
        "[{\"txid\":\"$txid\",\"vout\":$vout}]" \
        "{\"$address\":$amount,\"$change_address\":$change_amount}")
    signed=$(bitcoin_cli signrawtransactionwithwallet "$unsigned" | jq -r '.hex')

    echo $signed
}

npm run start-db
npm run start-regtest -- "$data_dir"

setup_id=test_setup
locked_funds_tx=$(create_transaction bcrt1p0kxevp4v9eulwu0hsed4jwtlfe2nz6dqntyj6tp833u9js8re7rs6uqs99 10.0 0.005 0)
prover_stake_tx=$(create_transaction bcrt1p0e73ksayxrmxj23mmmtu5502uaanamx7hxml9j60ycu24x95gg4qagarnf 2.0 0.005 1)
locked_funds_txid=$(bitcoin_cli decoderawtransaction "$locked_funds_tx" | jq -r '.txid')
prover_stake_txid=$(bitcoin_cli decoderawtransaction "$prover_stake_tx" | jq -r '.txid')

# Just assuming bitcoin-cli will always use the first output for the value.
locked_funds_output_index=0
prover_stake_output_index=0

npm run emulate-setup -- --setup-id $setup_id \
    --locked $locked_funds_txid:$locked_funds_output_index \
    --stake $prover_stake_txid:$prover_stake_output_index

bitcoin_cli sendrawtransaction "$locked_funds_tx"
bitcoin_cli sendrawtransaction "$prover_stake_tx"

ts-node ./src/agent/protocol-logic/send-proof.ts bitsnark_prover_1 "$setup_id" --fudge
