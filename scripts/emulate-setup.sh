#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

cleanup() {
    pkill -f 'python -m bitsnark.core.db_listener'
}
trap cleanup EXIT HUP INT QUIT TERM

npm run start-bitcoin-signer -- bitsnark_prover_1 prover &
npm run start-bitcoin-signer -- bitsnark_verifier_1 verifier &

ts-node ./src/agent/setup/emulate-setup.ts "$@"
