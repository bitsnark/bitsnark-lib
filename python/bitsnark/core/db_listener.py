"""Monitor DB to sign and broadcast transactions."""
import argparse
import logging
import os
import typing
import time

from sqlalchemy import create_engine, select
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.environ import load_bitsnark_dotenv
from .models import TransactionTemplate, Setups, SetupStatus, OutgoingStatus
from .sign_transactions import sign_setup, TransactionProcessingError
from ..cli.broadcast import broadcast_transaction

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)


BITCON_NODE_ADDR = f"http://rpcuser:rpcpassword@localhost:{os.getenv('BITCOIN_NODE_PORT', '18443')}/wallet/testwallet"


def sign_setups(dbsession, agent_id, role):
    'Loop over unsigned setups and sign them.'
    unsigned_setups = dbsession.execute(
        select(Setups).where(Setups.status == SetupStatus.UNSIGNED)
    ).scalars().all()
    for setup in unsigned_setups:
        logger.info("Processing setup %s", setup.id)
        try:
            sign_setup(setup.id, agent_id, role, dbsession, False)
            setup.status = SetupStatus.SIGNED
        except TransactionProcessingError:
            logger.exception("Error processing setup %s", setup.id)
            setup.status = SetupStatus.FAILED
        dbsession.commit()


def broadcast_transactions(dbsession, bitcoin_rpc):
    'Loop over ready transactions and broadcast them.'
    ready_transactions = dbsession.execute(
        select(TransactionTemplate).where(TransactionTemplate.status == OutgoingStatus.READY)
    ).scalars().all()
    for tx in ready_transactions:
        logger.info("Processing transaction %s...", tx.name)
        try:
            txid = broadcast_transaction(tx, dbsession, bitcoin_rpc)
            if tx.tx_data is None:
                tx.tx_data = {}
            tx.tx_data['txid'] = txid
            flag_modified(tx, 'tx_data')
            tx.status = OutgoingStatus.PUBLISHED
        except ValueError:
            logger.exception("Error processing transaction %s", tx.name)
            tx.status = OutgoingStatus.REJECTED
        dbsession.commit()


def main(argv: typing.Sequence[str] = None):
    """Entry point"""

    load_bitsnark_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument('--agent-id', required=True, help='Process only transactions with this agent ID')
    parser.add_argument('--role', required=True, choices=['prover', 'verifier'],
                        help='Role of the agent (prover or verifier)')
    parser.add_argument('--sign', required=False, action='store_true', help='Sign transactions')
    parser.add_argument('--broadcast', required=False, action='store_true', help='Broadcast transactions')
    parser.add_argument('--loop', required=False, action='store_true', help='Run in a loop')

    args = parser.parse_args(argv)

    if not args.agent_id:
        parser.error("Must specify --agent-id")
    if not args.role:
        parser.error("Must specify --role")
    if not args.sign and not args.broadcast:
        parser.error("Must specify --sign or --broadcast")

    engine = create_engine(f"{POSTGRES_BASE_URL}/{args.agent_id}")
    dbsession = Session(engine)
    if args.broadcast:
        bitcoin_rpc = BitcoinRPC(BITCON_NODE_ADDR)

    def listen():
        if args.sign:
            sign_setups(dbsession, args.agent_id, args.role)
        if args.broadcast:
            broadcast_transactions(dbsession, bitcoin_rpc)

    listen()
    if args.loop:
        while True:
            time.sleep(10)
            listen()


if __name__ == "__main__":
    main()
