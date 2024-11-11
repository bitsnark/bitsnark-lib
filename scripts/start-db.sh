#!/bin/sh -e

CONTAINER_NAME="postgres"

# Check if the container exists
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "Container $CONTAINER_NAME already exists."
    read -p "Do you want to remove the existing container? (y/n): " choice
    case "$choice" in
      y|Y ) docker rm -f $CONTAINER_NAME;;
      n|N ) echo "Exiting without making changes."; exit 1;;
        * ) echo "Invalid choice. Exiting without making changes."; exit 1;;
    esac
fi

# Run the PostgreSQL container and apply the schema
docker run --name $CONTAINER_NAME -e POSTGRES_PASSWORD=1234 -d -p 5432:5432 -v  ./db/schema.sql:/docker-entrypoint-initdb.d/schema.sql postgres
