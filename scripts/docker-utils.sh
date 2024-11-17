#!/bin/sh

# Function to check if a Docker container exists and handle it.
conditionally_remove_container() {
    local CONTAINER_NAME="$1"
    test -z "$(docker ps -aq -f name=$CONTAINER_NAME)" && return 0
    echo "Container $CONTAINER_NAME already exists."
    read -p "Do you want to remove the existing container? (y/n): " choice
    if [ "$choice" = y ] || [ "$choice" = Y ]; then
        docker rm -f "$CONTAINER_NAME" && return 0
    fi
    echo Existing container was not removed - exiting.
    return 1
}
