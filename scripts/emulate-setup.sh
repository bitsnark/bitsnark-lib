#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

# Start the python database listener if it is not already running.
if ! pgrep -f '[pP]ython -m bitsnark.core.db_listener' > /dev/null; then
    emulate_setup_cleanup() {
        pkill -f '[pP]ython -m bitsnark.core.db_listener'
    }
    trap emulate_setup_cleanup EXIT HUP INT QUIT TERM

    npm run start-bitcoin-signer -- bitsnark_prover_1 prover no-rerun &
    npm run start-bitcoin-signer -- bitsnark_verifier_1 verifier no-rerun &
fi

ts-node ./src/agent/setup/emulate-setup.ts "$@"
