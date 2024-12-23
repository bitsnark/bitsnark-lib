#!/bin/sh

regtest_container_name=bitcoin-node
postgres_container_name=postgres

if docker ps 2>&1 > /dev/null; then
    docker_cmd=docker
elif sudo docker ps 2>&1 > /dev/null; then
    docker_cmd='sudo docker'
else
    echo "Can't run docker commands, exiting."
    return 1
fi

prompt() {
    read -p "$1" response
    echo "$response"
}

if ! (return 0 2>/dev/null); then
    response=$(prompt "This script is intended to be sourced, not executed, continue? (y/N): ")
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    scripts_dir="$(dirname "$(realpath "$0")")"
fi

if [ -z "$INIT_CWD" ]; then
    response=$(prompt "This script is intended to be run with npm run-script, continue? (y/N): ")
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    [ "$scripts_dir" ] || scripts_dir="$(realpath .)"
    repo_root_dir="$(git -C "$scripts_dir" rev-parse --show-toplevel 2> /dev/null)"
    if [ -d "$repo_root_dir" ]; then
        echo "WARNING: Trying to cd to repo root dir: $repo_root_dir"
        cd "$repo_root_dir"
    else
        echo "WARNING: Couldn't find repo root dir, using current dir as root"
    fi
fi

missing_packages() {
    pip freeze | sort > /tmp/bitsnark_venv_installed
    sort ./python/requirements.txt > /tmp/bitsnark_requirements
    missing_packages="$(comm -23 /tmp/bitsnark_requirements /tmp/bitsnark_venv_installed)"
    rm /tmp/bitsnark_venv_installed /tmp/bitsnark_requirements
    echo "$missing_packages"
}

venv_dir="./python/venv"
python_command="${PYTHON:-python3}"
activate_python_venv() {
    [ "$bitsnark_python_env" ] && return
    if ! [ -d "$venv_dir" ]; then
        echo "Creating virtual environment in $venv_dir"
        "$python_command" -m venv "$venv_dir"
    fi
    if ! . "$venv_dir/bin/activate"; then
        echo Failed to activate virtual environment
        return 1
    fi
    if [ "$(missing_packages)" ]; then
        pip install --upgrade pip
        pip install -r ./python/requirements.txt
        if [ "$(missing_packages)" ]; then
            echo "Failed to install all requirements"
            return 1
        fi
    fi
    bitsnark_python_env=1
    export bitsnark_python_env
}

conditionally_remove_container() {
    local container_name="$1"
    test -z "$(sudo docker ps -aq -f name=$container_name)" && return 0
    echo "Container $container_name already exists."
    read -p "Do you want to remove the existing container? (y/n): " choice
    if [ "$choice" = y ] || [ "$choice" = Y ]; then
        $docker_cmd rm -f "$container_name" && return 0
    fi
    echo Existing container was not removed - exiting.
    return 1
}

bitcoin_cli() {
    $docker_cmd exec "$regtest_container_name" bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}
