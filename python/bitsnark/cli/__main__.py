import argparse
import sys
from typing import Sequence

from bitcointx import ChainParams
from sqlalchemy import create_engine
from sqlalchemy.orm.session import Session

from bitsnark.btc.rpc import BitcoinRPC
from ._base import Context
from .fund_and_send import FundAndSendCommand
from .show import ShowCommand
from .spend import SpendCommand

COMMAND_CLASSES = [
    FundAndSendCommand,
    ShowCommand,
    SpendCommand,
]


def main(argv: Sequence[str] = None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', help='database url',
                        default='postgresql://postgres:1234@localhost:5432/postgres')
    parser.add_argument('--rpc', help='bitcoin rpc url, including wallet',
                        default='http://rpcuser:rpcpassword@localhost:18443/wallet/testwallet')

    subparsers = parser.add_subparsers(
        dest='command',
    )
    commands = {}
    for command_cls in COMMAND_CLASSES:
        command = command_cls()
        subparser = subparsers.add_parser(command.name)
        command.init_parser(subparser)
        commands[command.name] = command

    args = parser.parse_args(argv)

    engine = create_engine(args.db)
    dbsession = Session(engine, autobegin=False)

    bitcoin_rpc = BitcoinRPC(args.rpc)
    try:
        blockchain_info = bitcoin_rpc.call('getblockchaininfo')
    except Exception as e:
        sys.exit(f"Cannot connect to the bitcoin node at {args.rpc} (error: {e})")

    if blockchain_info['chain'] == 'regtest':
        chain = 'bitcoin/regtest'
    elif blockchain_info['chain'] == 'test':
        chain = 'bitcoin/testnet'
    elif blockchain_info['chain'] == 'main':
        chain = 'bitcoin/mainnet'
    else:
        raise ValueError(f"Unknown chain {blockchain_info['chain']}")

    with ChainParams(chain):
        with dbsession.begin():
            command = commands[args.command]
            command.run(Context(
                args=args,
                bitcoin_rpc=bitcoin_rpc,
                dbsession=dbsession,
            ))


if __name__ == "__main__":
    main()
