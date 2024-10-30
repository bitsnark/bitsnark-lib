from __future__ import annotations
import argparse
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass

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


def add_tx_template_args(parser):
    parser.add_argument('--setup-id', required=True, help='Setup ID of the tx template')
    parser.add_argument('--agent-id', required=True, help='Agent ID of the tx template')
    parser.add_argument('--name', required=True, help='Name of the tx template')


def find_tx_template(context: Context) -> TransactionTemplate:
    dbsession = context.dbsession
    args = context.args
    try:
        return dbsession.execute(
            select(TransactionTemplate).filter_by(
                setupId=args.setup_id,
                agentId=args.agent_id,
                name=args.name,
            )
        ).scalar_one()
    except NoResultFound:
        sys.exit(
            f"Transaction template with setup ID {args.setup_id}, agent ID {args.agent_id} and name {args.name} not found")
