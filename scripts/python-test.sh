#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"
activate_python_venv

cd python
pytest
