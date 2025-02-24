"""Quick and dirty transaction broadcaster."""
import argparse
import logging

from bitcointx.core.script import CScript

from ._base import Command, add_tx_template_args, find_tx_template, Context
from ..core.funding import get_signed_transaction_from_funded_tx_template
from ..core.models import TransactionTemplate
from ..core.transactions import construct_signed_transaction
from ..scripteval import eval_tapscript

logger = logging.getLogger(__name__)


def broadcast_transaction(
    tx_template: TransactionTemplate,
    dbsession,
    bitcoin_rpc,
    evaluate_inputs: bool = False,
    no_test_mempool_accept: bool = False,
    dump: bool = False,
) -> str:
    logger.info("Attempting to broadcast %s", tx_template.name)

    if tx_template.fundable:
        tx = get_signed_transaction_from_funded_tx_template(
            tx_template=tx_template,
            dbsession=dbsession,
        )
    else:
        signed_tx = construct_signed_transaction(
            tx_template=tx_template,
            dbsession=dbsession,
        )
        tx = signed_tx.tx

    if evaluate_inputs:
        for input_index, input_witness in enumerate(tx.wit.vtxinwit):
            logger.info("Evaluating input %s", input_index)
            *witness_elems, tapscript, _ = input_witness.scriptWitness.stack
            eval_tapscript(
                witness_elems=witness_elems,
                script=CScript(tapscript),
                inIdx=input_index,
                txTo=tx,
                # TODO: would be swell to get it working without ignore_signature_errors!
                ignore_signature_errors=True,
            )

    signed_serialized_tx = tx.serialize().hex()

    logger.info("Broadcasting transaction: %s   -   %d bytes", tx_template.name, len(signed_serialized_tx) // 2)

    if dump:
        dump_filename = f"{tx_template.name}-signed-serialized-tx.dump"
        with open(dump_filename, "w", encoding="utf-8") as f:
            f.write(signed_serialized_tx)
        print("Dump written to", dump_filename)

    if not no_test_mempool_accept:
        mempoolaccept_ret = bitcoin_rpc.call(
            'testmempoolaccept',
            [signed_serialized_tx],
        )
        if not mempoolaccept_ret[0]['allowed']:
            raise ValueError(
                f"Transaction {tx_template.name!r} not accepted by mempool: {mempoolaccept_ret[0]['reject-reason']}")

    txid = bitcoin_rpc.call('sendrawtransaction', signed_serialized_tx)
    assert txid == tx_template.txid
    logger.info("Transaction broadcast: %s", txid)
    return txid


class BroadcastCommand(Command):
    """
    Broadcast a transaction template to the blockchain
    """
    name = 'broadcast'

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)
        parser.add_argument(
            '--no-test-mempool-accept',
            help='Test mempool acceptance before broadcasting',
            action='store_true',
        )
        parser.add_argument(
            '--eval-inputs',
            help='Evaluate input tapscript execution (experimental)',
            action='store_true',
        )
        parser.add_argument(
            '--dump',
            help='Dump tx as hex',
            action='store_true',
        )

    def run(
        self,
        context: Context,
    ) -> str:
        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc
        dbsession = context.dbsession
        evaluate_inputs = getattr(context.args, 'eval_inputs')
        no_test_mempool_accept = getattr(context.args, 'no_test_mempool_accept')
        dump = getattr(context.args, 'dump', None)
        return broadcast_transaction(
            tx_template=tx_template,
            dbsession=dbsession,
            bitcoin_rpc=bitcoin_rpc,
            evaluate_inputs=evaluate_inputs,
            no_test_mempool_accept=no_test_mempool_accept,
            dump=dump,
        )
