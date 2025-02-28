#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

if [ "$1" = sign ]; then
    action=--sign
elif [ "$1" = broadcast ]; then
    action=--broadcast
else
    echo "Usage: $0 [sign|broadcast] [agent_id] [prover|verifier] [no-rerun]"
    exit 1
fi
shift
agent_id=${1:-bitsnark_prover_1}
role=${2:-prover}
db_listener_command="python -m bitsnark.core.db_listener --agent-id $agent_id --role $role $action --loop"

cd python

if [ "$3" != 'no-rerun' ]; then
    while true; do
        $db_listener_command || true
        echo Bitcoin writer exited with code $?, restarting...
        sleep 1
    done
fi

$db_listener_command
