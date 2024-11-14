import argparse
import os

from bitcointx.core.script import CScript
from bitcointx.wallet import CCoinAddress

import sqlalchemy as sa

from bitsnark.core.models import TransactionTemplate
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from ._base import Command, add_tx_template_args, find_tx_template, Context


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
            prev_tx = dbsession.execute(
                sa.select(
                    TransactionTemplate,
                ).filter_by(
                    agent_id=tx_template.agent_id,
                    setup_id=tx_template.setup_id,
                    name=prev_tx_name,
                )
            ).scalar_one()
            prev_txid = prev_tx.tx_id
            prevout_index = inp['outputIndex']
            sc_index = inp['spendingConditionIndex']
            index = inp['index']
            print(f"- input {index}: {prev_txid}:{prevout_index} (tx: {prev_tx_name}, spendingCondition: {sc_index})")
        print("Outputs:")
        for outp in tx_template.outputs:
            index = outp['index']
            amount = parse_bignum(outp['amount'])
            script_pubkey = CScript(parse_hex_bytes(outp['taprootKey']))
            address = CCoinAddress.from_scriptPubKey(script_pubkey)
            print(f'- output {index}:')
            print(f'  - amount:       {amount} sat')
            print(f'  - address:      {address}')
            print(f'  - scriptPubKey: {script_pubkey!r} ({script_pubkey.hex()})')
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
