import logging
import pytest
import sqlalchemy as sa
import sqlalchemy_utils
from sqlalchemy.orm import Session
from bitcointx import ChainParams

from bitsnark.btc.rpc import BitcoinRPC
from .utils.docker_compose import start_stop_docker_compose
from .utils.bitcoin_wallet import BitcoinWallet
from .utils.npm import NPMCommandRunner
from .constants import (
    POSTGRES_URL_ROOT,
    POSTGRES_URL_PROVER,
    POSTGRES_URL_VERIFIER,
    BITCOIN_RPC_URL,
    DB_SCHEMA_FILE,
)

logger = logging.getLogger(__name__)


@pytest.fixture(autouse=True)
def use_regtest_bitcointx():
    with ChainParams("bitcoin/regtest"):
        yield


@pytest.fixture()
def npm() -> NPMCommandRunner:
    return NPMCommandRunner()


_docker_compose_running_on_module_level = False


@pytest.fixture()
def docker_compose():
    """Start and stop docker-compose after every test"""
    if _docker_compose_running_on_module_level:
        yield
    else:
        with start_stop_docker_compose():
            yield


@pytest.fixture(scope="module")
def docker_compose_module_level():
    """Start and stop docker compose once for a test module"""
    global _docker_compose_running_on_module_level
    _docker_compose_running_on_module_level = True
    with start_stop_docker_compose():
        yield
    _docker_compose_running_on_module_level = False


def _create_agent_db(db_url: str) -> sa.Engine:
    sqlalchemy_utils.create_database(db_url)
    engine = sa.create_engine(db_url, echo=True)
    with open(DB_SCHEMA_FILE) as f:
        schema = f.read()
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(sa.text(schema))
    return engine


@pytest.fixture()
def db_engine_root(docker_compose) -> sa.Engine:
    # Everything depends on all DBs being here, so we'll roll with it
    root_engine = sa.create_engine(POSTGRES_URL_ROOT)
    _create_agent_db(POSTGRES_URL_PROVER)
    _create_agent_db(POSTGRES_URL_VERIFIER)
    return root_engine


@pytest.fixture()
def dbsession(db_engine_root) -> Session:
    # Root dbsession
    return Session(bind=db_engine_root, autobegin=False)


@pytest.fixture()
def dbsession_prover(db_engine_root) -> Session:
    engine = sa.create_engine(POSTGRES_URL_PROVER)
    return Session(bind=engine, autobegin=False)


@pytest.fixture()
def dbsession_verifier(db_engine_root) -> Session:
    engine = sa.create_engine(POSTGRES_URL_VERIFIER)
    return Session(bind=engine, autobegin=False)


@pytest.fixture()
def btc_rpc(docker_compose) -> BitcoinRPC:
    rpc = BitcoinRPC(BITCOIN_RPC_URL)
    blockcount = rpc.call("getblockcount")
    # Mine enough blocks to activate segwit
    required = 432 - blockcount
    if required > 0:
        logger.info("Mining %s blocks to activate segwit", required)
        rpc.mine_blocks(required)

    # This is not there :(
    # blockchaininfo = rpc.call('getblockchaininfo')
    # assert blockchaininfo['bip9_softforks']['segwit']['status'] == 'active'

    return rpc


@pytest.fixture()
def btc_wallet(btc_rpc) -> BitcoinWallet:
    wallet, created = BitcoinWallet.load_or_create(
        name="testwallet", rpc_base_url=btc_rpc.url
    )
    if created:
        wallet.mine(432)
    return wallet
