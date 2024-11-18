# This should follow agent.conf.ts
import os

POSTGRES_USER = os.getenv('POSTGRES_USER', 'postgres')
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', 5433))
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', '1234')
POSTGRES_URL = f'postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/postgres'

# These are not important now, maybe later
# BITCOIN_NODE_NETWORK = os.getenv('BITCOIN_NODE_NETWORK', 'regtest')
# BITCOIN_NODE_USERNAME = os.getenv('BITCOIN_NODE_USERNAME', 'rpcuser')
# BITCOIN_NODE_PASSWORD = os.getenv('BITCOIN_NODE_PASSWORD', 'rpcpassword')
# BITCOIN_NODE_HOST = os.getenv('BITCOIN_NODE_HOST', '127.0.0.1')
# BITCOIN_NODE_PORT = int(os.getenv('BITCOIN_NODE_PORT', 18443))

