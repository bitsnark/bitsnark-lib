#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv
DYLD_FALLBACK_LIBRARY_PATH="$DYLD_FALLBACK_LIBRARY_PATH:/usr/local/lib:/opt/homebrew/lib"
export DYLD_FALLBACK_LIBRARY_PATH

cd python
BITCOIN_NODE_PORT=19443
export BITCOIN_NODE_PORT
pytest
