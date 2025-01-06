"""Monitor DB to sign and broadcast transactions."""
import argparse
import logging
import os
import typing
import time

from sqlalchemy import create_engine, select
from sqlalchemy.orm.session import Session
from bitcointx.core.key import XOnlyPubKey

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.environ import load_bitsnark_dotenv
from .models import TransactionTemplate, Setups, SetupStatus, OutgoingStatus
from .sign_transactions import sign_setup, TransactionProcessingError
from ..cli.broadcast import broadcast_transaction
from ..cli.verify_signatures import verify_setup_signatures

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
        logger.info("Signing setup %s", setup.id)
        try:
            sign_setup(setup.id, agent_id, role, dbsession, False)
            setup.status = SetupStatus.SIGNED
        except TransactionProcessingError:
            logger.exception("Error signing setup %s", setup.id)
            setup.status = SetupStatus.FAILED
        dbsession.commit()


def verify_setups(dbsession, prover_pubkey, verifier_pubkey, ignore_missing_script):
    'Loop over merged setups and verify the signatures of the specified signer.'
    merged_setups = dbsession.execute(
        select(Setups).where(Setups.status == SetupStatus.MERGED)
    ).scalars().all()
    for setup in merged_setups:
        logger.info("Verifying setup %s", setup.id)
        try:
            for signer_role, signer_pubkey in [('PROVER', prover_pubkey), ('VERIFIER', verifier_pubkey)]:
                verify_setup_signatures(dbsession, setup.id, signer_role, signer_pubkey, ignore_missing_script)
            setup.status = SetupStatus.VERIDIFED
        except TransactionProcessingError:
            logger.exception("Error verifying setup %s", setup.id)
            setup.status = SetupStatus.FAILED
        dbsession.commit()


def broadcast_transactions(dbsession, bitcoin_rpc):
    'Loop over ready transactions and broadcast them.'
    ready_transactions = dbsession.execute(
        select(TransactionTemplate).where(TransactionTemplate.status == OutgoingStatus.READY)
    ).scalars().all()
    for tx in ready_transactions:
        logger.info("Broadcasting transaction %s...", tx.name)
        try:
            broadcast_transaction(tx, dbsession, bitcoin_rpc)
            tx.status = OutgoingStatus.PUBLISHED
        except ValueError:
            logger.exception("Error broadcasting transaction %s", tx.name)
            tx.status = OutgoingStatus.REJECTED
        dbsession.commit()


def main(argv: typing.Sequence[str] = None):
    'Entry point.'

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

    prover_pubkey = XOnlyPubKey.fromhex(os.environ['PROVER_SCHNORR_PUBLIC'])
    verifier_pubkey = XOnlyPubKey.fromhex(os.environ['VERIFIER_SCHNORR_PUBLIC'])

    engine = create_engine(f"{POSTGRES_BASE_URL}/{args.agent_id}")
    dbsession = Session(engine)
    if args.broadcast:
        bitcoin_rpc = BitcoinRPC(BITCON_NODE_ADDR)

    def listen():
        if args.sign:
            sign_setups(dbsession, args.agent_id, args.role)
            verify_setups(dbsession, prover_pubkey, verifier_pubkey, ignore_missing_script=True)
        if args.broadcast:
            broadcast_transactions(dbsession, bitcoin_rpc)

    listen()
    if args.loop:
        while True:
            time.sleep(10)
            listen()


if __name__ == "__main__":
    main()
