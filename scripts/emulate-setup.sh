#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

ts-node ./src/agent/setup/emulate-setup.ts "$@"
