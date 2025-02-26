#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

prover=bitsnark_prover_1
verifier=bitsnark_verifier_1
setup_id=test_setup

npm run postgres
npm run regtest

echo 'Emulating setup (this will move to a real setup later)'
if [ "$1" = tg-setup ]; then
    shift
    echo Telegram setup not yet supported for e2e
    exit 1
else
    npm run emulate-setup-final
fi

echo Starting agents
npm run prover-protocol &
npm run verifier-protocol &

echo Starting bitcoin services
npm run bitcoin-services &

sleep 1

if [ "$1" = happiest ]; then
    shift
    echo Sending a valid proof to execute the happiest path
else
    fudge='--fudge'
    echo Sending a fudged proof to execute a successful challenge
fi

ts-node ./src/agent/protocol-logic/send-proof.ts $prover $setup_id $fudge

while sleep 1; do
    [ $(bitcoin_cli getmempoolinfo | jq .unbroadcastcount) -gt 0 ] && generate_blocks
done
wait
