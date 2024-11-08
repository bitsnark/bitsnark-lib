from __future__ import annotations
from abc import ABC, abstractmethod
import argparse
from dataclasses import dataclass
import os
import sys

from sqlalchemy import select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm.session import Session

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.models import TransactionTemplate


class Command(ABC):
    name: str

    def init_parser(self, parser: argparse.ArgumentParser):
        # add args etc -- optional
        pass

    @abstractmethod
    def run(self, context: Context):
        ...


@dataclass
class Context:
    args: argparse.Namespace
    dbsession: Session
    bitcoin_rpc: BitcoinRPC


def add_tx_template_args(parser: argparse.ArgumentParser):
    parser.add_argument('--setup-id', required=True, help='Setup ID of the tx template')
    parser.add_argument('--agent-id', required=True, help='Agent ID of the tx template')
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--name', help='Name of the tx template')
    group.add_argument('--ordinal', help='Ordinal of the tx template')


def find_tx_template(context: Context) -> TransactionTemplate:
    dbsession = context.dbsession
    args = context.args

    tx_template_query = select(TransactionTemplate).filter_by(
        setup_id=args.setup_id,
        agent_id=args.agent_id,
    )
    if args.name is not None:
        tx_template_query = tx_template_query.filter_by(name=args.name)
    elif args.ordinal is not None:
        tx_template_query = tx_template_query.filter_by(ordinal=args.ordinal)
    else:
        raise ValueError("Either --name or --ordinal must be provided")

    try:
        return dbsession.execute(tx_template_query).scalar_one()
    except NoResultFound:
        sys.exit(
            f"Transaction template with setup ID {args.setup_id}, agent ID {args.agent_id} and name {args.name} not found")


def get_default_prover_privkey_hex() -> str:
    return os.getenv('PROVER_SCHNORR_PRIVATE', '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2')


def get_default_verifier_privkey_hex() -> str:
    return os.getenv('VERIFIER_SCHNORR_PRIVATE', 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0')
