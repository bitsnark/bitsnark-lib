#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv
trap cleanup EXIT HUP INT QUIT TERM

npm run start-db
npm run start-regtest


echo Running Python listeners in the background:
cd python
npm run start-python-listener -- bitsnark_prover_1 prover &
pids="$pids $!"
npm run start-python-listener -- bitsnark_verifier_1 verifier &
pids="$pids $!"
cd ..

setup_id=test_setup
locked_funds_tx=$(create_transaction bcrt1p0kxevp4v9eulwu0hsed4jwtlfe2nz6dqntyj6tp833u9js8re7rs6uqs99 10.0 0.005 0)
prover_stake_tx=$(create_transaction bcrt1p0e73ksayxrmxj23mmmtu5502uaanamx7hxml9j60ycu24x95gg4qagarnf 2.0 0.005 1)
locked_funds_txid=$(bitcoin_cli decoderawtransaction "$locked_funds_tx" | jq -r '.txid')
prover_stake_txid=$(bitcoin_cli decoderawtransaction "$prover_stake_tx" | jq -r '.txid')
echo Locked funds txid: $locked_funds_txid
echo Prover stake txid: $prover_stake_txid

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

echo Sending fudged proof and running the listener and the agents
ts-node ./src/agent/protocol-logic/send-proof.ts bitsnark_prover_1 "$setup_id" --fudge
bitcoin_cli generatetoaddress 1 $(bitcoin_cli getnewaddress) > /dev/null
npm run start-bitcoin-listener &
pids="$pids $!"

echo Running the protocol agents
npm run start-protocol-prover &
pids="$pids $!"
npm run start-protocol-verifier &
pids="$pids $!"

wait
