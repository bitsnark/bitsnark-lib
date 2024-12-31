#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

cd python
BITCOIN_NODE_PORT=19443
export BITCOIN_NODE_PORT
pytest
