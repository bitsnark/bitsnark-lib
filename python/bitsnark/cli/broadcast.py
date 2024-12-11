import argparse
import itertools
import logging
from sqlalchemy import select

from bitcointx.core import CMutableTransaction, CTxInWitness, CTxWitness
from bitcointx.core.script import CScript, CScriptWitness

from bitsnark.core.parsing import parse_hex_bytes, parse_hex_str
from ._base import Command, add_tx_template_args, find_tx_template, Context
from ..core.models import TransactionTemplate

logger = logging.getLogger(__name__)


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

    def run(
        self,
        context: Context,
    ) -> str:
        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc
        dbsession = context.dbsession

        logger.info("Attempting to broadcast %s", tx_template.name)
        signed_serialized_tx = tx_template.tx_data.get('signedSerializedTx')
        if not signed_serialized_tx:
            raise ValueError(f"Transaction {tx_template.name} has no signedSerializedTx")


        signed_serialized_tx = parse_hex_str(signed_serialized_tx)

        tx = CMutableTransaction.deserialize(bytes.fromhex(signed_serialized_tx))
        input_witnesses = []

        for input_index, inp in enumerate(tx_template.inputs):
            verifier_signature_raw = inp.get('verifierSignature')
            if not verifier_signature_raw:
                raise ValueError(f"Transaction {tx_template.name} input #{input_index} has no verifierSignature")
            verifier_signature = parse_hex_bytes(verifier_signature_raw)

            prover_signature_raw = inp.get('proverSignature')
            if not prover_signature_raw:
                raise ValueError(f"Transaction {tx_template.name} input #{input_index} has no proverSignature")
            prover_signature = parse_hex_bytes(prover_signature_raw)

            prev_tx = dbsession.execute(
                select(TransactionTemplate).filter_by(
                    setup_id=tx_template.setup_id,
                    name=inp['templateName'],
                )
            ).scalar_one()

            prevout_index = inp['outputIndex']
            prevout = prev_tx.outputs[prevout_index]
            spending_condition = prevout['spendingConditions'][
                inp['spendingConditionIndex']
            ]

            tapscript = CScript(parse_hex_bytes(spending_condition['script']))

            witness_raw = tx_template.protocol_data or []
            witness = [
                parse_hex_bytes(s) for s in
                # This flattens the list of lists
                itertools.chain.from_iterable(witness_raw)
            ]

            control_block = parse_hex_bytes(spending_condition['controlBlock'])

            input_witness = CTxInWitness(CScriptWitness(
                stack=[
                    *witness,
                    verifier_signature,
                    prover_signature,
                    tapscript,
                    control_block,
                ],
            ))
            input_witnesses.append(input_witness)

        tx.wit = CTxWitness(vtxinwit=input_witnesses)

        signed_serialized_tx = tx.serialize().hex()

        if not context.args.no_test_mempool_accept:
            mempoolaccept_ret = bitcoin_rpc.call(
                'testmempoolaccept',
                [signed_serialized_tx],
            )
            logger.info("Test mempool accept result: %s", mempoolaccept_ret)
            if not mempoolaccept_ret[0]['allowed']:
                raise ValueError(f"Transaction {tx_template.name!r} not accepted by mempool: {mempoolaccept_ret[0]['reject-reason']}")

        txid = bitcoin_rpc.call(
            'sendrawtransaction',
            signed_serialized_tx,
        )
        # print(txid)
        assert txid == tx_template.txid
        logger.info(f"Transaction broadcast: {txid}")
        return txid
