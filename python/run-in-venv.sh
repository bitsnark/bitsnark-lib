#!/bin/sh
venv_name=venv
python_command="${PYTHON:-python3}"
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
venv_dir="$script_dir/$venv_name"
if ! [ -d "$venv_dir" ]; then
    echo "Creating virtual environment in $venv_dir"
    "$python_command" -m venv "$venv_dir"
    . "$venv_dir/bin/activate"
    pip install -r "$script_dir/requirements.txt"
fi
if ! . "$venv_dir/bin/activate"; then
    echo Failed to activate virtual environment
    exit 1
fi
PATH="$repo_root_dir/node_modules/.bin:$PATH"
exec "$@"
