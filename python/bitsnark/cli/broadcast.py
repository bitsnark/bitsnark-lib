'Quick and dirty transaction broadcaster.'
import argparse
import logging
from sqlalchemy import select
from sqlalchemy.orm.session import Session

from bitcointx.core import CMutableTransaction, CTxInWitness, CTxWitness
from bitcointx.core.script import CScript, CScriptWitness

from bitsnark.core.parsing import parse_hex_bytes, parse_hex_str
from ._base import Command, add_tx_template_args, find_tx_template, Context
from ..core.models import TransactionTemplate
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
    tx = create_tx_with_witness(
        tx_template=tx_template,
        dbsession=dbsession,
    )

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

    if dump:
        dump_filename = f"{tx_template.name}-signed-serialized-.dump"
        with open(dump_filename, "w", encoding="utf-8") as f:
            f.write(signed_serialized_tx)
        print("Dump written to", dump_filename)

    if not no_test_mempool_accept:
        mempoolaccept_ret = bitcoin_rpc.call(
            'testmempoolaccept',
            [signed_serialized_tx],
        )
        logger.info("Test mempool accept result: %s", mempoolaccept_ret)
        if not mempoolaccept_ret[0]['allowed']:
            raise ValueError(
                f"Transaction {tx_template.name!r} not accepted by mempool: {mempoolaccept_ret[0]['reject-reason']}")

    txid = bitcoin_rpc.call('sendrawtransaction', signed_serialized_tx)
    assert txid == tx_template.txid
    logger.info("Transaction broadcast: %s", txid)
    return txid


def create_tx_with_witness(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
) -> CMutableTransaction:
    signed_serialized_tx = tx_template.tx_data.get('signedSerializedTx')
    if not signed_serialized_tx:
        raise ValueError(f"Transaction {tx_template.name} has no signedSerializedTx")

    signed_serialized_tx = parse_hex_str(signed_serialized_tx)

    # TODO: signedSerializedTx is a total misnomer here as it doesn't contain any signature data
    tx = CMutableTransaction.deserialize(bytes.fromhex(signed_serialized_tx))
    if tx.wit is not None and tx.wit.serialize().strip(b'\x00'):
        raise ValueError(f"Transaction {tx_template.name} already has witness data")
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

        try:
            witness = [parse_hex_bytes(datum) for datum in tx_template.protocol_data[input_index]]
        except (TypeError, IndexError):
            witness = []

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
    return tx


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
