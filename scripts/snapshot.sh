#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

snapshot_dir="$(realpath ./snapshot)"
prover=bitsnark_prover_1
verifier=bitsnark_verifier_1

create() {
    read -p "Deleting current snapshot in $snapshot_dir, continue? (y/N): " response
    [ "$response" = y ] || [ "$response" = Y ] || exit 1
    rm -rf snapshot || true
    mkdir -p snapshot
    docker exec -it "$postgres_container_name" pg_dump -aU postgres $prover > ./snapshot/prover.sql
    docker exec -it "$postgres_container_name" pg_dump -aU postgres $verifier > ./snapshot/verifier.sql
    bitcoin_cli stop
    cp -a "$bitcoin_data_dir" ./snapshot/regtest
    $docker_cmd start "$bitcoin_container_name"
}

load() {
    echo "Loading snapshot from $snapshot_dir"
    npm run start-db
    bitcoin_cli stop || true
    cp -a ./snapshot/regtest "$bitcoin_data_dir"
    npm run start-regtest -- persist
    docker exec -i "$postgres_container_name" psql -U postgres $prover < ./snapshot/prover.sql
    docker exec -i "$postgres_container_name" psql -U postgres $verifier < ./snapshot/verifier.sql
}

dir_exists() {
    local path="$1"
    local name="$2"
    if ! [ -d "$path" ]; then
        echo "$name directory not found: $path"
        exit 1
    fi
}

if [ "$1" = create ]; then
    dir_exists "$bitcoin_data_dir" 'Bitcoin data'
    create
else
    dir_exists "$snapshot_dir" Snapshot
    load
fi
