#!/bin/sh -e

. "$(dirname "$(realpath "$0")")/common.sh"

# Will exit if the container remains running.
conditionally_remove_container "$postgres_container_name"

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
docker run --name "$postgres_container_name" -dp 5432:5432 \
    -v "$sql_file:/docker-entrypoint-initdb.d/schema.sql" \
    -e POSTGRES_PASSWORD=1234 \
    postgres

# Wait for the container to be ready.
until docker exec "$postgres_container_name" pg_isready -U postgres; do
  sleep 1
done

rm "$sql_file"
