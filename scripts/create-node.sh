docker stop bitcoin-node
docker rm bitcoin-node


# Start the Bitcoin node in regtest mode with the correct port bindings -p 8332:8332
echo "Starting the Bitcoin node in regtest mode..."
docker run -d --name bitcoin-node -v bitcoin-data:/bitcoin/.bitcoin  -p 18443:18443 -p 18444:18444 ruimarinho/bitcoin-core:latest \
  -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword -fallbackfee=0.0002 


# Wait for the node to start
echo "Waiting for the Bitcoin node to start..."
sleep 20

# Check if the Bitcoin node is running and accessible
echo "Checking if the Bitcoin node is running and accessible..."
docker logs bitcoin-node

if ! docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getblockchaininfo > /dev/null 2>&1; then
    echo "Error: Bitcoin node is not running or RPC credentials are incorrect."
    exit 1
fi

# Create and load a wallet
echo "Creating and loading a wallet..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword createwallet "testwallet"
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword loadwallet "testwallet"

# Generate initial blocks to fund the wallet
echo "Generating initial blocks..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword generatetoaddress 101 $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress)

# Generate mock transactions
echo "Generating mock transactions..."
for i in {1..10}
do
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword sendtoaddress $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress) 0.1
done

# Generate another block to include the transactions
echo "Generating another block to include the transactions..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword generatetoaddress 1 $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress)