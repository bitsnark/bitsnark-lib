import argparse
import os
import sys
from dataclasses import dataclass
from decimal import Decimal
from typing import Sequence

from bitcointx import ChainParams
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.core.script import CScript
from bitcointx.wallet import CCoinAddress
from sqlalchemy import create_engine, select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm.session import Session

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from bitsnark.core.models import TransactionTemplate
from tests.conftest import dbsession
from ._base import Command, add_tx_template_args, find_tx_template, Context


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
    for command_cls in Command.__subclasses__():
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


class ShowCommand(Command):
    name = 'show'

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)

    def run(
        self,
        context: Context,
    ):
        tx_template = find_tx_template(context)
        dbsession = context.dbsession

        terminal = os.get_terminal_size()

        # print("Object structure")
        # pprint_json_structure(tx_template.object)
        print("Name:".ljust(19), tx_template.name)
        print("Ordinal:".ljust(19), tx_template.ordinal)
        for key, value in tx_template.object.items():
            if key in ('inputs', 'outputs'):
                continue
            key = f"{key}:".ljust(20)
            value = str(value)
            maxwidth = max(terminal.columns - 35, 30)
            if len(value) > maxwidth:
                value = value[:maxwidth] + "..."
            print(f"{key}{value}")
        print("Inputs:")
        for inp in tx_template.inputs:
            prev_tx_name = inp['transactionName']
            prev_tx = dbsession.get(
                TransactionTemplate,
                (tx_template.agentId, tx_template.setupId, prev_tx_name)
            )
            prev_txid = prev_tx.txId
            prevout_index = inp['outputIndex']
            sc_index = inp['spendingConditionIndex']
            index = inp['index']
            print(f"- input {index}: {prev_txid}:{prevout_index} (tx: {prev_tx_name}, spendingCondition: {sc_index})")
        print("Outputs:")
        for outp in tx_template.outputs:
            index = outp['index']
            amount = parse_bignum(outp['amount'])
            address = CCoinAddress.from_scriptPubKey(CScript(parse_hex_bytes(outp['taprootKey'])))
            print(f'- output {index}:')
            print(f'  - amount:  {amount} sat')
            print(f'  - address: {address}')
            print(f'  - spendingConditions:')
            for sc in outp['spendingConditions']:
                print(f'    - #{sc["index"]}:')
                for key, value in sc.items():
                    value = str(value)
                    maxwidth = max(terminal.columns - 50, 30)
                    if len(value) > maxwidth:
                        value = value[:maxwidth] + "..."
                    key = f"{key}:".ljust(25)
                    print(f'      - {key} {value}')



class FundAndSendCommand(Command):
    """
    Send a transaction with identical outputs but inputs from the wallet
    """
    name = 'fund_and_send'

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)
        parser.add_argument('--fee-rate', help='Fee rate in sat/vb', type=float, default=10)

    def run(
        self,
        context: Context,
    ):

        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc
        change_address = bitcoin_rpc.call('getnewaddress')

        outputs = []
        for output_index, out in enumerate(tx_template.outputs):
            amount_raw = out.get('amount')
            script_pubkey_raw = out.get('taprootKey')
            keys = ", ".join(out.keys())

            if amount_raw is None:
                raise ValueError(f"Transaction {tx_template.name} output {output_index} has no amount. Keys: {keys}")
            if script_pubkey_raw is None:
                raise ValueError(f"Transaction {tx_template.name} output {output_index} has no taprootKey. Keys: {keys}")

            amount = parse_bignum(amount_raw)
            amount_dec = Decimal(amount) / Decimal(10**8)
            script_pubkey = CScript(parse_hex_bytes(script_pubkey_raw))
            address = CCoinAddress.from_scriptPubKey(script_pubkey)
            outputs.append({
                str(address): str(amount_dec),
            })

        change_index = len(outputs)

        print(f"Funding transaction with identical outputs as {tx_template.name}")

        ret = bitcoin_rpc.call(
            'walletcreatefundedpsbt',
            [],  # Inputs
            outputs,  # Outputs
            0,  # Locktime
            {
                'add_inputs': True,
                'changeAddress': change_address,
                'changePosition': change_index,
                'fee_rate': context.args.fee_rate,
                # 'lockUnspents': True,
            }
        )
        # print('walletcreatefundedpsbt', ret)

        ret = bitcoin_rpc.call(
            'walletprocesspsbt',
            ret['psbt'],
        )
        if not ret['complete']:
            raise ValueError(f"PSBT not complete: {ret}")
        # print('walletprocesspsbt', ret)
        signed_psbt = PartiallySignedTransaction.from_base64(ret['psbt'])

        tx = signed_psbt.extract_transaction()
        serialized_tx = tx.serialize().hex()

        print(f"Testing mempool acceptance...")
        mempool_accept = bitcoin_rpc.call(
            'testmempoolaccept',
            [serialized_tx],
        )
        assert mempool_accept[0]['allowed'], mempool_accept

        print(f"Broadcasting transaction...")
        tx_id = bitcoin_rpc.call(
            'sendrawtransaction',
            serialized_tx,
        )
        # print(tx_id)
        assert tx_id == tx.GetTxid()[::-1].hex()
        bitcoin_rpc.mine_blocks()
        print(f"Transaction broadcast: {tx_id}")


if __name__ == "__main__":
    main()
