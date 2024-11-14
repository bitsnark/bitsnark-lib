#!/bin/bash

# Function to check if a Docker container exists and handle it
prompt_delete_container() {
    local CONTAINER_NAME=$1

    if [ ! "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
        return 0;
    fi

    echo "Container $CONTAINER_NAME already exists."
    read -p "Do you want to remove the existing container? (y/n): " choice
        case "$choice" in
            y|Y ) docker rm -f $CONTAINER_NAME; return 0;;
            * ) echo "FAIL. Old container was not removed."; return 1;;
        esac

}
