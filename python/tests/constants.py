POSTGRES_USER = 'postgres'
POSTGRES_HOST = 'localhost'
POSTGRES_PORT = 5433  # nonstandard port to avoid conflicts with non-test postgres
POSTGRES_PASSWORD = 'testpostgres'
POSTGRES_DATABASE = 'postgres'
POSTGRES_URL = f'postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DATABASE}'

BITCOIN_RPC_URL = 'http://rpcuser:rpcpassword@localhost:19443'
