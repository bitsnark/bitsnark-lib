import argparse
import sys
from typing import Sequence
import logging

from bitcointx import ChainParams
from sqlalchemy import create_engine
from sqlalchemy.orm.session import Session

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.core.environ import load_bitsnark_dotenv
from ._base import Context, determine_chain
from .fund_and_send import FundAndSendCommand
from .show import ShowCommand
from .spend import SpendCommand
from .test_spending_conditions import TestSpendingConditionsCommand
from .test_scripts import TestScriptsCommand
from .broadcast import BroadcastCommand
from .calculate_script_optimizations import CalculateScriptOptimizationsCommand
from .verify_signatures import VerifySignaturesCommand

COMMAND_CLASSES = [
    FundAndSendCommand,
    ShowCommand,
    SpendCommand,
    TestSpendingConditionsCommand,
    TestScriptsCommand,
    BroadcastCommand,
    CalculateScriptOptimizationsCommand,
    VerifySignaturesCommand,
]


def main(argv: Sequence[str] = None):
    load_bitsnark_dotenv()

    parser = argparse.ArgumentParser()
    parser.add_argument("--db", help="database url", default=POSTGRES_BASE_URL)
    parser.add_argument(
        "--rpc",
        help="bitcoin rpc url, including wallet",
        default="http://rpcuser:rpcpassword@localhost:18443/wallet/testwallet",
    )

    subparsers = parser.add_subparsers(
        dest="command",
    )
    commands = {}
    for command_cls in COMMAND_CLASSES:
        command = command_cls()
        subparser = subparsers.add_parser(command.name)
        command.init_parser(subparser)
        commands[command.name] = command

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(message)s",
    )

    engine = create_engine(f"{args.db}/{args.agent_id}")
    dbsession = Session(engine, autobegin=False)

    bitcoin_rpc = BitcoinRPC(args.rpc)
    try:
        chain = determine_chain(bitcoin_rpc)
    except Exception as e:
        sys.exit(f"Cannot connect to the bitcoin node at {args.rpc} (error: {e})")

    with ChainParams(chain):
        with dbsession.begin():
            command = commands[args.command]
            command.run(
                Context(
                    args=args,
                    bitcoin_rpc=bitcoin_rpc,
                    dbsession=dbsession,
                )
            )


if __name__ == "__main__":
    main()
