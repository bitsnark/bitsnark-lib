import argparse
import itertools
import logging

from bitcointx.core import CMutableTransaction, CTxIn, CTxOut, COutPoint, CTransaction, CTxInWitness, CTxWitness
from bitcointx.core.key import CKey
from bitcointx.core.script import CScript, CScriptWitness, OP_RETURN
from bitcointx.wallet import CCoinAddress

from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from bitsnark.core.signing import sign_input
from ._base import Command, add_tx_template_args, find_tx_template, Context, get_default_prover_privkey_hex, \
    get_default_verifier_privkey_hex

logger = logging.getLogger(__name__)


class TestMempoolAcceptFailure(Exception):
    def __init__(
        self,
        *,
        reject_reason: str,
        raw_result = None,
    ):
        super().__init__(reject_reason)
        self.reject_reason = reject_reason
        self.raw_result = raw_result


class SpendCommand(Command):
    """
    Spend an output according to spending condition
    """
    name = 'spend'

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)
        parser.add_argument('--spending-condition', required=True, type=int,
                            help='Index of the spending condition to use')
        parser.add_argument('--prevout', required=True, help='Previous output as txid:vout')
        parser.add_argument('--prover-privkey',
                            help='Prover schnorr private key as hex for signing',
                            default=get_default_prover_privkey_hex())
        parser.add_argument('--verifier-privkey',
                            help='Verifier schnorr private key as hex for signing',
                            default=get_default_verifier_privkey_hex())
        parser.add_argument('--to-address', default='OP_RETURN',
                            help='Address to send the funds to. Omit or specify OP_RETURN to spend all as fees')
        parser.add_argument('--amount',
                            type=int,
                            help='Amount to send to the output (default: 0 if OP_RETURN, else input amount / 2')
        # parser.add_argument('--fee-rate', help='Fee rate in sat/vb', type=float, default=10)

    def run(
        self,
        context: Context,
    ):
        args = context.args
        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc

        prover_privkey = CKey.fromhex(args.prover_privkey)
        verifier_privkey = CKey.fromhex(args.verifier_privkey)

        prev_txid, prev_out_index = args.prevout.split(":")
        prev_out_index = int(prev_out_index)
        prev_tx_response = bitcoin_rpc.call('gettransaction', prev_txid)
        prev_tx = CTransaction.deserialize(bytes.fromhex(prev_tx_response['hex']))
        spent_outputs = [
            prev_tx.vout[prev_out_index],
        ]

        output_spec = tx_template.outputs[prev_out_index]
        amount_sat = parse_bignum(output_spec['amount'])
        # script_pubkey = CScript(parse_hex_bytes(output_spec['taprootKey']))
        spending_condition = output_spec["spendingConditions"][args.spending_condition]
        tapscript = CScript(parse_hex_bytes(spending_condition['script']))

        to_address = args.to_address
        if not to_address or to_address == 'OP_RETURN':
            to_script_pubkey = CScript([OP_RETURN, b'There must be some filler here or the TX will get rejected'])
            if args.amount is not None:
                amount_sat_out = int(args.amount)
            else:
                amount_sat_out = 0
        else:
            to_script_pubkey = CCoinAddress(to_address).to_scriptPubKey()
            if args.amount is not None:
                amount_sat_out = int(args.amount)
            else:
                amount_sat_out = amount_sat // 2

        logger.info(
            "Spending the output %s, assuming it corresponds to the %s output with spending condition %s, to %s "
            "(amount in: %s sat, amount out: %s sat)",
            args.prevout,
            tx_template.name,
            args.spending_condition,
            to_address,
            amount_sat,
            amount_sat_out,
        )

        inputs = [
            CTxIn(
                COutPoint(
                    hash=bytes.fromhex(prev_txid)[::-1],
                    n=prev_out_index,
                ), nSequence=(spending_condition.get('timeLock') or 0xffffffff),
            )
        ]
        outputs = [
            CTxOut(
                nValue=amount_sat_out,
                scriptPubKey=to_script_pubkey,
            )
        ]

        tx = CMutableTransaction(
            vin=inputs,
            vout=outputs,
            nVersion=2,
        )
        prover_signature = sign_input(
            script=tapscript,
            tx=tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=prover_privkey,
        )
        verifier_signature = sign_input(
            script=tapscript,
            tx=tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=verifier_privkey,
        )

        control_block = parse_hex_bytes(spending_condition['controlBlock'])
        example_witness_raw = spending_condition.get('exampleWitness', [])
        example_witness = [
            parse_hex_bytes(s) for s in
            # This flattens the list of lists
            itertools.chain.from_iterable(example_witness_raw)
        ]
        input_witnesses = [
            CTxInWitness(CScriptWitness(
                stack=[
                    *example_witness,
                    verifier_signature,
                    prover_signature,
                    tapscript,
                    control_block,
                ],
            ))
        ]

        tx.wit = CTxWitness(vtxinwit=input_witnesses)

        serialized_tx = tx.serialize().hex()
        mempool_accept = bitcoin_rpc.call(
            'testmempoolaccept',
            [serialized_tx],
        )
        if not mempool_accept[0]['allowed']:
            logger.info("Mempool rejection: %s", mempool_accept)
            raise TestMempoolAcceptFailure(
                reject_reason=mempool_accept[0]['reject-reason'],
                raw_result=mempool_accept,
            )

        txid = bitcoin_rpc.call(
            'sendrawtransaction',
            serialized_tx,
        )
        logger.info("TX broadcast: %s", txid)
        bitcoin_rpc.mine_blocks()
