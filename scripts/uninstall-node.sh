#!/bin/bash

# Stop the Bitcoin node process if it is running
if pgrep -x "bitcoind" > /dev/null; then
    echo "Stopping the Bitcoin node process..."
    pkill -f bitcoind
    sleep 5  # Wait for the process to terminate
else
    echo "Bitcoin node process is not running."
fi

# Stop the Docker container if it is running
if docker ps -q --filter "name=bitcoin-node" | grep -q .; then
    echo "Stopping the Docker container..."
    docker stop bitcoin-node
else
    echo "Docker container 'bitcoin-node' is not running."
fi

# Remove the Docker container if it exists
if docker ps -a -q --filter "name=bitcoin-node" | grep -q .; then
    echo "Removing the Docker container..."
    docker rm bitcoin-node
else
    echo "Docker container 'bitcoin-node' does not exist."
fi

# Remove the Docker image if it exists
if docker images -q ruimarinho/bitcoin-core | grep -q .; then
    echo "Removing the Docker image..."
    docker rmi ruimarinho/bitcoin-core
else
    echo "Docker image 'ruimarinho/bitcoin-core' does not exist."
fi

# Remove any unused Docker volumes
echo "Removing any unused Docker volumes..."
docker volume prune -f

# Remove the temporary Bitcoin configuration directory if it exists
if [ -d /tmp/bitcoin ]; then
    echo "Removing the temporary Bitcoin configuration directory..."
    rm -rf /tmp/bitcoin
else
    echo "Temporary Bitcoin configuration directory does not exist."
fi