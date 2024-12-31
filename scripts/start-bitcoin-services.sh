#!/bin/sh -e
. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

pkill -f 'python -m bitsnark.core.db_listener' > /dev/null || true
pkill -f 'ts-node ./src/agent/listener/bitcoin-listener.ts' > /dev/null || true

prover=bitsnark_prover_1
verifier=bitsnark_verifier_1
npm run start-bitcoin-signer -- bitsnark_prover_1 prover &
npm run start-bitcoin-signer -- bitsnark_verifier_1 verifier &
npm run start-bitcoin-sender -- $prover prover &
npm run start-bitcoin-sender -- $verifier verifier &
npm run start-bitcoin-listener $prover &
npm run start-bitcoin-listener $verifier &
wait
