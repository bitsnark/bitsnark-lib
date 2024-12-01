#!/bin/sh -e

. ./scripts/docker-utils.sh

CONTAINER_NAME=postgres

# Will exit if the container remains running.
conditionally_remove_container "$CONTAINER_NAME"

# Prepare the SQL creation script.
script_dir="$(dirname "$(realpath "$0")")"
repo_root_dir="$(git -C "$script_dir" rev-parse --show-toplevel)"
schema_file="$repo_root_dir/db/schema.sql"
schema="$(cat $schema_file)"
agents='bitsnark_prover_1 bitsnark_verifier_1'
sql_file="$(mktemp)"
for agent in $agents; do
    cat <<EOF >> "$sql_file"
CREATE DATABASE $agent;
\connect $agent
$schema
EOF
done
chmod 644 "$sql_file"

# Run the PostgreSQL container.
docker run --name "$CONTAINER_NAME" -dp 5432:5432 \
    -v "$sql_file:/docker-entrypoint-initdb.d/schema.sql" \
    -e POSTGRES_PASSWORD=1234 \
    postgres

until docker exec "$CONTAINER_NAME" pg_isready -U postgres; do
  sleep 1
done

rm "$sql_file"
