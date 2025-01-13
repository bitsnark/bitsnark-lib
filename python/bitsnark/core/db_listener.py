"""Monitor DB to sign and broadcast transactions."""
import argparse
import logging
import os
import typing
import time

from sqlalchemy import create_engine, select
from sqlalchemy.orm.session import Session
from bitcointx.core.key import XOnlyPubKey, CKey

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.environ import load_bitsnark_dotenv
from bitsnark.core.types import Role
from .models import TransactionTemplate, Setups, SetupStatus, OutgoingStatus
from .sign_transactions import sign_setup, sign_tx_template, TransactionProcessingError
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
            sign_setup(setup.id, agent_id, role, dbsession)
            setup.status = SetupStatus.SIGNED
        except TransactionProcessingError:
            logger.exception("Error signing setup %s", setup.id)
            setup.status = SetupStatus.FAILED


def verify_setups(dbsession, prover_pubkey, verifier_pubkey, ignore_missing_script):
    'Loop over merged setups and verify the signatures of the specified signer.'
    merged_setups = dbsession.execute(
        select(Setups).where(Setups.status == SetupStatus.MERGED)
    ).scalars().all()
    for setup in merged_setups:
        logger.info("Verifying setup %s", setup.id)
        try:
            for signer_role, signer_pubkey in [('PROVER', prover_pubkey), ('VERIFIER', verifier_pubkey)]:
                verify_setup_signatures(
                    dbsession=dbsession,
                    setup_id=setup.id,
                    signer_role=signer_role,
                    signer_pubkey=signer_pubkey,
                    ignore_missing_script=ignore_missing_script)
            setup.status = SetupStatus.VERIFIED
        except TransactionProcessingError:
            logger.exception("Error verifying setup %s", setup.id)
            setup.status = SetupStatus.FAILED


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


def handle_special_transactions(
    *,
    dbsession: Session,
    role: Role,
    privkey: CKey,
):
    special_tx_names = []
    if role == 'verifier':
        special_tx_names.append('PROOF_REFUTED')

    ready_transactions = dbsession.execute(
        select(TransactionTemplate).where(TransactionTemplate.status == OutgoingStatus.READY).where(
            TransactionTemplate.name.in_(special_tx_names)
        )
    ).scalars().all()
    for tx in ready_transactions:
        logger.info("Handling special transaction %s...", tx.name)
        try:
            if tx.name == 'PROOF_REFUTED':
                logger.info('Signing PROOF_REFUTED')
                sign_tx_template(
                    tx_template=tx,
                    role=role,
                    private_key=privkey,
                    dbsession=dbsession,
                )
        except Exception:
            logger.exception("Error handling special transaction %s", tx.name)
            tx.status = OutgoingStatus.REJECTED


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
    if args.role == 'prover':
        privkey = CKey.fromhex(os.environ['PROVER_SCHNORR_PRIVATE'])
        pubkey = prover_pubkey
    else:
        privkey = CKey.fromhex(os.environ['VERIFIER_SCHNORR_PRIVATE'])
        pubkey = verifier_pubkey
    if privkey.xonly_pub != pubkey:
        raise ValueError(
            f"X-Only pubkey {privkey.xonly_pub} does not match public key {pubkey}"
        )

    engine = create_engine(f"{POSTGRES_BASE_URL}/{args.agent_id}")
    dbsession = Session(engine, autobegin=False)
    if args.broadcast:
        bitcoin_rpc = BitcoinRPC(BITCON_NODE_ADDR)

    def listen():
        if args.sign:
            with dbsession.begin():
                sign_setups(dbsession, args.agent_id, args.role)
            with dbsession.begin():
                verify_setups(dbsession, prover_pubkey, verifier_pubkey, ignore_missing_script=True)
        if args.broadcast:
            with dbsession.begin():
                handle_special_transactions(
                    dbsession=dbsession,
                    role=args.role,
                    privkey=privkey,
                )
                broadcast_transactions(dbsession, bitcoin_rpc)

    listen()
    if args.loop:
        while True:
            time.sleep(10)
            listen()


if __name__ == "__main__":
    main()
