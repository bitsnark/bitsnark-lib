#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

# Start the python database listener if it is not already running.
if ! pgrep -f 'python -m bitsnark.core.db_listener' > /dev/null; then
    emulate_setup_cleanup() {
        pkill -f 'python -m bitsnark.core.db_listener'
    }
    trap emulate_setup_cleanup EXIT HUP INT QUIT TERM

    npm run start-bitcoin-signer -- bitsnark_prover_1 prover &
    npm run start-bitcoin-signer -- bitsnark_verifier_1 verifier &
fi

ts-node ./src/agent/setup/emulate-setup.ts "$@"
