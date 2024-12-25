#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

if [ "$1" = 'bitsnark_prover_1' ]; then
    shift
    module='protocol-prover.ts'
elif [ "$1" = 'bitsnark_verifier_1' ]; then
    shift
    module='protocol-verifier.ts'
else
    echo "Unknown agent type: $1" >&2
    exit 1
fi

ts-node "./src/agent/protocol-logic/$module" "$@"
