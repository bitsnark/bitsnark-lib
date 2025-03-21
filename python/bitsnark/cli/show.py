import argparse
import os

from bitcointx.core.script import CScript
from bitcointx.wallet import CCoinAddress

import sqlalchemy as sa

from bitsnark.core.models import TransactionTemplate
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from ._base import Command, add_tx_template_args, find_tx_template, Context
from ..core.transactions import construct_signed_transaction


class ShowCommand(Command):
    name = "show"

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)

    def run(
        self,
        context: Context,
    ):
        tx_template = find_tx_template(context)
        dbsession = context.dbsession

        try:
            terminal = os.get_terminal_size()
        except OSError:
            terminal = io.StringIO()
            terminal.columns = 80

        # print("Object structure")
        print("Name:".ljust(19), tx_template.name)
        print("Ordinal:".ljust(19), tx_template.ordinal)
        print_dict(
            tx_template.__dict__,
            ignored_keys=("name", "ordinal", "inputs", "outputs"),
        )
        print("Inputs:")
        for inp in tx_template.inputs:
            if inp.get("funded"):
                print(f"- input {index}:")
                print_dict(
                    inp,
                    indent="  - ",
                )
                continue
            prev_tx_name = inp["templateName"]
            prev_tx = dbsession.execute(
                sa.select(
                    TransactionTemplate,
                ).filter_by(
                    setup_id=tx_template.setup_id,
                    name=prev_tx_name,
                )
            ).scalar_one()
            prev_txid = prev_tx.txid
            prevout_index = inp["outputIndex"]
            sc_index = inp["spendingConditionIndex"]
            index = inp["index"]
            prevout = prev_tx.outputs[prevout_index]
            prevout_amount = parse_bignum(prevout["amount"])
            print(
                f"- input {index}: {prev_txid}:{prevout_index} "
                f"({prevout_amount} sat, "
                f"tx: {prev_tx_name}, output: {prevout_index}, spendingCondition: {sc_index})"
            )
            print_dict(
                inp,
                indent="  - ",
                # Already have these above
                ignored_keys=(
                    "index",
                    "templateName",
                    "outputIndex",
                    "spendingConditionIndex",
                ),
            )
        print("Outputs:")
        for outp in tx_template.outputs:
            if outp.get("funded"):
                print(f"- output {index}:")
                print(f"  - amount:       {amount} sat")
                print_dict(
                    outp,
                    indent="  - ",
                    ignored_keys=["index", "amount"],
                )
                continue
            index = outp["index"]
            amount = parse_bignum(outp["amount"])
            script_pubkey = CScript(parse_hex_bytes(outp["taprootKey"]))
            try:
                address = CCoinAddress.from_scriptPubKey(script_pubkey)
            except Exception as e:
                address = f"ERROR: {e}"
            print(f"- output {index}:")
            print(f"  - amount:       {amount} sat")
            print(f"  - address:      {address}")
            print(f"  - scriptPubKey: {script_pubkey!r}")
            print(f"  - scriptPubKey (hex): {script_pubkey.hex()}")
            print(f"  - spendingConditions:")
            for sc in outp["spendingConditions"]:
                print_dict(sc, indent="      - ")

        # Deserialized tx stuff
        signed_tx = construct_signed_transaction(
            tx_template=tx_template,
            dbsession=dbsession,
            ignore_funded_inputs_and_outputs=True,
        )
        tx = signed_tx.tx
        tx_virtual_size = tx.get_virtual_size()
        print("")
        print(f"Transaction virtual size: {tx_virtual_size} vB")

        def print_size(prefix, size):
            print(
                f"{prefix} size: {size} B ({size / 4} vB, {size / 4 / tx_virtual_size * 100:.2f}% of tx size)"
            )

        print_size("Witness", len(tx.wit.serialize()))

        total_witness_data_size = 0
        total_witness_script_size = 0
        total_witness_cblock_size = 0

        for i, input_witness in enumerate(tx.wit.vtxinwit):
            *witness_elems, tapscript, cblock = input_witness.scriptWitness.stack
            witness_data_size = sum(len(e) for e in witness_elems)
            witness_script_size = len(tapscript)
            witness_cblock_size = len(cblock)
            print(
                f"- Input witness {i}: data {witness_data_size} B, script {witness_script_size} B, cblock {witness_cblock_size} B, stack elems: {len(witness_elems)}"
            )
            total_witness_data_size += witness_data_size
            total_witness_script_size += witness_script_size
            total_witness_cblock_size += witness_cblock_size

        print_size("- Witness data", total_witness_data_size)
        print_size("- Witness script", total_witness_script_size)
        print_size("- Witness control block", total_witness_cblock_size)


def print_dict(
    d: dict,
    *,
    indent="",
    ignored_keys=tuple(),
    ignored_key_prefix: str = "_",
):
    terminal = os.get_terminal_size()

    for key, value in d.items():
        if key in ignored_keys:
            continue
        if key.startswith(ignored_key_prefix):
            continue
        value = str(value)
        maxwidth = max(terminal.columns - 50, 30)
        if len(value) > maxwidth:
            value = value[:maxwidth] + "..."
        key = f"{key}:".ljust(25)
        print(f"{indent}{key} {value}")
