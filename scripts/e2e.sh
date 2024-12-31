#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

prover=bitsnark_prover_1
verifier=bitsnark_verifier_1
setup_id=test_setup

echo 'Emulating setup (this will move to a real setup later)'
npm run emulate-setup
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
