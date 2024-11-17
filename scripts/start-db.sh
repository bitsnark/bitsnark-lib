#!/bin/sh -e

. ./scripts/docker-utils.sh

CONTAINER_NAME=postgres

# Will exit if the container remains running.
conditionally_remove_container "$CONTAINER_NAME"

# Run the PostgreSQL container and apply the schema.
docker run --name "$CONTAINER_NAME" -e POSTGRES_PASSWORD=1234 -d -p 5432:5432 \
    -v ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql postgres
