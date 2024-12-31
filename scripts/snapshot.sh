#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

prover=bitsnark_prover_1
verifier=bitsnark_verifier_1

create() {
    rm -rI snapshot || true
    mkdir -p snapshot
    docker exec -it "$postgres_container_name" pg_dump -aU postgres $prover > ./snapshot/prover.sql
    docker exec -it "$postgres_container_name" pg_dump -aU postgres $verifier > ./snapshot/verifier.sql
    bitcoin_cli stop
    cp -a "$bitcoin_data_dir" ./snapshot/bitcoin_data
    $docker_cmd start "$bitcoin_container_name"
}

load() {
    echo 'Reading snapshot'
    npm run start-db
    bitcoin_cli stop
    cp -a ./snapshot/bitcoin_data "$bitcoin_data_dir"
    npm run start-regtest
    docker exec -i "$postgres_container_name" psql -U postgres $prover < ./snapshot/prover.sql
    docker exec -i "$postgres_container_name" psql -U postgres $verifier < ./snapshot/verifier.sql
}

if [ "$1" = create ]; then
    create
else
    load
fi
