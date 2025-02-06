#!/bin/sh -e
. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

pkill -f '/bitcoin-writer.sh (sign|broadcast)' > /dev/null || true
pkill -f 'ts-node ./src/agent/listener/bitcoin-listener.ts' > /dev/null || true
pkill -f '[Pp]ython -m bitsnark.core.db_listener' > /dev/null || true

prover="${1:-bitsnark_prover_1}"
verifier="${2:-bitsnark_verifier_1}"
[ "$3" = 'no-rerun' ] && no_rerun="$3"

npm run bitcoin-signer -- bitsnark_prover_1 prover $no_rerun &
npm run bitcoin-signer -- bitsnark_verifier_1 verifier $no_rerun &
npm run bitcoin-sender -- $prover prover $no_rerun &
npm run bitcoin-sender -- $verifier verifier $no_rerun &
npm run bitcoin-listener $prover $no_rerun &
npm run bitcoin-listener $verifier $no_rerun &
wait
