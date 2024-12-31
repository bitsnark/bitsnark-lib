#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

prover=bitsnark_prover_1
verifier=bitsnark_verifier_1
setup_id=test_setup

echo Generating extrenal transactions
locked_funds_tx=$(create_transaction bcrt1p0kxevp4v9eulwu0hsed4jwtlfe2nz6dqntyj6tp833u9js8re7rs6uqs99 10.0 0.005 0)
prover_stake_tx=$(create_transaction bcrt1p0e73ksayxrmxj23mmmtu5502uaanamx7hxml9j60ycu24x95gg4qagarnf 2.0 0.005 1)
locked_funds_txid=$(bitcoin_cli decoderawtransaction "$locked_funds_tx" | jq -r '.txid')
prover_stake_txid=$(bitcoin_cli decoderawtransaction "$prover_stake_tx" | jq -r '.txid')
echo Locked funds txid: $locked_funds_txid
echo Prover stake txid: $prover_stake_txid

# Just assuming bitcoin-cli will always use the first output for the value.
locked_funds_output_index=0
prover_stake_output_index=0

echo 'Emulating setup (this will move to a real setup later)'
npm run emulate-setup -- --setup-id $setup_id \
    --locked $locked_funds_txid:$locked_funds_output_index \
    --stake $prover_stake_txid:$prover_stake_output_index

echo Sending locked funds:
bitcoin_cli sendrawtransaction "$locked_funds_tx"
generate_blocks 6

echo Sending prover stake:
bitcoin_cli sendrawtransaction "$prover_stake_tx"
generate_blocks 6
sleep 1

read -p 'Fudge the proof? (y/n): ' response
echo -n 'Sending '
if [ "$response" = y ] || [ "$response" = Y ]; then
    fudge='--fudge'
    echo -n 'fudged '
fi
echo proof
ts-node ./src/agent/protocol-logic/send-proof.ts $prover "$setup_id" $fudge

echo Hit enter to advance a block or precede with a number to generate that many blocks
while true; do
    read blocks
    generate_blocks $blocks
done
exit
