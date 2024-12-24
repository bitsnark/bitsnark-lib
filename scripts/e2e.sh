#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

pids=''
run_in_bg() {
    local id="$1"
    shift
    "$@" | while read line; do echo "$id: $line"; done &
    pids="$pids $!"
}
cleanup() {
    trap - EXIT INT HUP
    for pid in $pids; do
        kill $pid
    done
}
trap cleanup EXIT INT HUP

npm run start-db
npm run start-regtest

setup_id=test_setup
locked_funds_tx=$(create_transaction bcrt1p0kxevp4v9eulwu0hsed4jwtlfe2nz6dqntyj6tp833u9js8re7rs6uqs99 10.0 0.005 0)
prover_stake_tx=$(create_transaction bcrt1p0e73ksayxrmxj23mmmtu5502uaanamx7hxml9j60ycu24x95gg4qagarnf 2.0 0.005 1)
locked_funds_txid=$(bitcoin_cli decoderawtransaction "$locked_funds_tx" | jq -r '.txid')
prover_stake_txid=$(bitcoin_cli decoderawtransaction "$prover_stake_tx" | jq -r '.txid')

echo Running Python listeners in the background:
cd python
run_in_bg prover_python python -m bitsnark.core.db_listener --role prover --agent-id bitsnark_prover_1
run_in_bg verifier_python python -m bitsnark.core.db_listener --role verifier --agent-id bitsnark_verifier_1
cd ..

# Just assuming bitcoin-cli will always use the first output for the value.
locked_funds_output_index=0
prover_stake_output_index=0

npm run emulate-setup -- --setup-id $setup_id \
    --locked $locked_funds_txid:$locked_funds_output_index \
    --stake $prover_stake_txid:$prover_stake_output_index

echo Sending locked funds:
bitcoin_cli sendrawtransaction "$locked_funds_tx"

echo Sending prover stake:
bitcoin_cli sendrawtransaction "$prover_stake_tx"

echo Sending proof:
ts-node ./src/agent/protocol-logic/send-proof.ts bitsnark_prover_1 "$setup_id" --fudge

echo Running the protocol agents
run_in_bg prover_protocol npm run start-protocol-prover
run_in_bg verifier_protocol npm run start-protocol-verifier
