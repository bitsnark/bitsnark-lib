#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv
trap cleanup EXIT HUP INT QUIT TERM

npm run start-python-listener -- bitsnark_prover_1 prover &
npm run start-python-listener -- bitsnark_verifier_1 verifier &
ts-node ./src/agent/setup/emulate-setup.ts "$@"
