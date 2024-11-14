#!/bin/sh -e

source ./scripts/docker-utils.sh

CONTAINER_NAME="postgres"

# returns 1 if container exsists but not removed
prompt_delete_container $CONTAINER_NAME

# Run the PostgreSQL container and apply the schema
docker run --name $CONTAINER_NAME -e POSTGRES_PASSWORD=1234 -d -p 5432:5432 -v  ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql postgres
