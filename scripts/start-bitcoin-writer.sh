#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

if [ "$1" = sign ]; then
    action=--sign
elif [ "$1" = broadcast ]; then
    action=--broadcast
else
    echo "Usage: $0 [sign|broadcast] [agent_id] [prover|verifier] [no-loop]"
    exit 1
fi
shift
agent_id=${1:-bitsnark_prover_1}
role=${2:-prover}
[ "$3" = 'no-loop' ] || loop='--loop'

cd python
python -m bitsnark.core.db_listener --agent-id $agent_id --role $role $loop $action
