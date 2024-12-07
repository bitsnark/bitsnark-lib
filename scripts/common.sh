#!/bin/sh

regtest_container_name=bitcoin-node
postgres_container_name=postgres

prompt() {
    read -p "$1" response
    echo "$response"
}

if ! (return 0 2>/dev/null); then
    response=$(prompt "This script is intended to be sourced, not executed, continue? (y/N): ")
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
fi

if [ -z "$INIT_CWD" ]; then
    response=$(prompt "This script is intended to be run with npm run-script, continue? (y/N): ")
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    scripts_dir="$(dirname "$(realpath "$0")")"
    repo_root_dir="$(git -C "$scripts_dir" rev-parse --show-toplevel)"
    cd "$repo_root_dir"
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
    test -z "$(docker ps -aq -f name=$container_name)" && return 0
    echo "Container $container_name already exists."
    read -p "Do you want to remove the existing container? (y/n): " choice
    if [ "$choice" = y ] || [ "$choice" = Y ]; then
        docker rm -f "$container_name" && return 0
    fi
    echo Existing container was not removed - exiting.
    return 1
}

bitcoin_cli() {
    docker exec "$regtest_container_name" bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword "$@"
}
