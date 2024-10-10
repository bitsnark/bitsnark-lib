#!/bin/sh
venv_name=venv
python_command="${PYTHON:-python3}"
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
venv_dir="$script_dir/$venv_name"
requirements="$script_dir/requirements.txt"

# Create virtual environment if it doesn't exist.
if ! [ -d "$venv_dir" ]; then
    echo "Creating virtual environment in $venv_dir"
    "$python_command" -m venv "$venv_dir"
fi

# Activate virtual environment.
if ! . "$venv_dir/bin/activate"; then
    echo Failed to activate virtual environment
    exit 1
fi

# Install requirements if they are not already installed.
pip freeze | sort > /tmp/bitsnark_venv_installed
sort "$requirements" > /tmp/bitsnark_requirements
missing_packages="$(comm -23 /tmp/bitsnark_requirements /tmp/bitsnark_venv_installed)"
rm /tmp/bitsnark_venv_installed /tmp/bitsnark_requirements
if [ "$missing_packages" ]; then
    pip install -r "$requirements"
fi

# Add node_modules/.bin to PATH. and run the command.
PATH="$repo_root_dir/node_modules/.bin:$PATH"
exec "$@"
