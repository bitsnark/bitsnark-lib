import logging
import pytest
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import Session
from bitcointx import ChainParams

from bitsnark.btc.rpc import BitcoinRPC
from .utils.docker_compose import start_stop_docker_compose
from .utils.bitcoin_wallet import BitcoinWallet
from .utils.npm import NPMCommandRunner
from .constants import POSTGRES_URL, BITCOIN_RPC_URL

logger = logging.getLogger(__name__)


@pytest.fixture(autouse=True)
def use_regtest_bitcointx():
    with ChainParams('bitcoin/regtest'):
        yield


@pytest.fixture()
def npm() -> NPMCommandRunner:
    return NPMCommandRunner()


@pytest.fixture()
def docker_compose():
    with start_stop_docker_compose():
        yield


@pytest.fixture()
def db_engine(docker_compose) -> Engine:
    return create_engine(POSTGRES_URL)


@pytest.fixture()
def dbsession(db_engine) -> Session:
    return Session(bind=db_engine, autobegin=False)


@pytest.fixture()
def btc_rpc(docker_compose) -> BitcoinRPC:
    rpc = BitcoinRPC(BITCOIN_RPC_URL)
    blockcount = rpc.call('getblockcount')
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
    return BitcoinWallet.create(
        name="wallet1",
        rpc_base_url=btc_rpc.url,
    )



