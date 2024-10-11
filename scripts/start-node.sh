
echo "Starting the Bitcoin node in regtest mode..."
docker run --rm -d --name bitcoin-node -v bitcoin-data:/bitcoin/.bitcoin -p 18443:18443 -p 18444:18444 ruimarinho/bitcoin-core:latest \
    -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword -fallbackfee=0.0002  -rpcallowip=0.0.0.0/0 -rpcbind=0.0.0.0 

echo "Waiting for the Bitcoin node to start..."
sleep 20

echo "Checking if the Bitcoin node is running and accessible..."
docker logs bitcoin-node

if ! docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getblockchaininfo > /dev/null 2>&1; then
    echo "Error: Bitcoin node is not running or RPC credentials are incorrect."
    exit 1
fi

echo "Creating and loading a wallet..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword createwallet "testwallet"
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword loadwallet "testwallet"

echo "Generating initial blocks..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword generatetoaddress 101 $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress)

echo "Generating mock transactions..."
for i in {1..10}
do
    docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword sendtoaddress $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress) 0.1
done

echo "Generating another block to include the transactions..."
docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword generatetoaddress 1 $(docker exec bitcoin-node bitcoin-cli -regtest -rpcuser=rpcuser -rpcpassword=rpcpassword getnewaddress)