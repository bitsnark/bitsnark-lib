from bitsnark.constants import PROJECT_ROOT_DIR

POSTGRES_USER = "postgres"
POSTGRES_HOST = "localhost"
POSTGRES_PORT = 5433  # nonstandard port to avoid conflicts with non-test postgres
POSTGRES_PASSWORD = "testpostgres"

POSTGRES_DATABASE_ROOT = "postgres"
POSTGRES_URL_ROOT = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DATABASE_ROOT}"

POSTGRES_DATABASE_PROVER = "bitsnark_prover_1"
POSTGRES_URL_PROVER = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DATABASE_PROVER}"

POSTGRES_DATABASE_VERIFIER = "bitsnark_verifier_1"
POSTGRES_URL_VERIFIER = f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DATABASE_VERIFIER}"

DB_SCHEMA_FILE = PROJECT_ROOT_DIR / "db" / "schema.sql"

BITCOIN_RPC_USER = "rpcuser"
BITCOIN_RPC_PASSWORD = "rpcpassword"
BITCOIN_RPC_HOST = "localhost"
BITCOIN_RPC_PORT = 19443
BITCOIN_RPC_URL = f"http://{BITCOIN_RPC_USER}:{BITCOIN_RPC_PASSWORD}@{BITCOIN_RPC_HOST}:{BITCOIN_RPC_PORT}"

# nodejs (e.g. npm run emulate-setup) reads .env and then fall's back to defaults in agent.conf.ts,
# but environment variables supplied by us have precedence
# we want to both supply our own values for database and bitcoin node, and also make sure that
# we don't accidentally use the values from the .env file.
NODE_ENV = {
    "POSTGRES_USER": POSTGRES_USER,
    "POSTGRES_PASSWORD": POSTGRES_PASSWORD,
    "POSTGRES_HOST": POSTGRES_HOST,
    "POSTGRES_PORT": str(POSTGRES_PORT),
    "BITCOIN_NODE_NETWORK": "regtest",
    "BITCOIN_NODE_USERNAME": BITCOIN_RPC_USER,
    "BITCOIN_NODE_PASSWORD": BITCOIN_RPC_PASSWORD,
    "BITCOIN_NODE_HOST": BITCOIN_RPC_HOST,
    "BITCOIN_NODE_PORT": str(BITCOIN_RPC_PORT),
    "PROVER_SCHNORR_PRIVATE": "415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2",
    "PROVER_SCHNORR_PUBLIC": "ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75",
    "VERIFIER_SCHNORR_PRIVATE": "d4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0",
    "VERIFIER_SCHNORR_PUBLIC": "86ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79",
}
