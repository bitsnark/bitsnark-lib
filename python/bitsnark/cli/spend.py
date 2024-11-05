import os
import argparse
from decimal import Decimal

from bitcointx.core import CMutableTransaction, CTxIn, CTxOut, COutPoint, CTransaction, CTxInWitness, CTxWitness
from bitcointx.core.key import CKey
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.core.script import CScript, CScriptWitness
from bitcointx.wallet import CCoinAddress

from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from ._base import Command, add_tx_template_args, find_tx_template, Context


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
                            default=os.getenv('PROVER_SCHNORR_PRIVATE',
                                              '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2'))
        parser.add_argument('--verifier-privkey',
                            help='Verifier schnorr private key as hex for signing',
                            default=os.getenv('VERIFIER_SCHNORR_PRIVATE',
                                              'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0'))
        parser.add_argument('--to-address', help='Address to send the funds to', required=False)
        # parser.add_argument('--fee-rate', help='Fee rate in sat/vb', type=float, default=10)

    def run(
        self,
        context: Context,
    ):
        args = context.args
        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc
        to_address = args.to_address
        if not to_address:
            to_address = bitcoin_rpc.call('getnewaddress')
        to_address = CCoinAddress(to_address)
        prover_privkey = CKey.fromhex(args.prover_privkey)
        verifier_privkey = CKey.fromhex(args.verifier_privkey)

        prev_txid, prev_out_index = args.prevout.split(":")
        prev_out_index = int(prev_out_index)

        output_spec = tx_template.outputs[prev_out_index]
        amount_sat = parse_bignum(output_spec['amount'])
        script_pubkey = CScript(parse_hex_bytes(output_spec['taprootKey']))
        spending_condition = output_spec["spendingConditions"][args.spending_condition]
        tapscript = CScript(parse_hex_bytes(spending_condition['script']))

        print(
            f"Spending the output {args.prevout}, assuming it corresponds to the {tx_template.name} output with "
            f"spending condition {args.spending_condition}, to {to_address}"
        )

        inputs = [
            CTxIn(
                COutPoint(
                    hash=bytes.fromhex(prev_txid)[::-1],
                    n=prev_out_index,
                )
            )
        ]
        spent_outputs  = [
            CTxOut(
                nValue=amount_sat,
                scriptPubKey=script_pubkey,
            )
        ]
        amount_sat_out = amount_sat // 2  # TODO: handle fee more gracefully
        outputs = [
            CTxOut(
                nValue=amount_sat_out,
                scriptPubKey=to_address.to_scriptPubKey(),
            )
        ]

        tx = CMutableTransaction(
            vin=inputs,
            vout=outputs,
            nVersion=2,
        )
        prover_signature = _sign_input(
            script=tapscript,
            tx=tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=prover_privkey,
        )
        verifier_signature = _sign_input(
            script=tapscript,
            tx=tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=verifier_privkey,
        )

        control_block = parse_hex_bytes(spending_condition['controlBlock'])
        tapscript = parse_hex_bytes(spending_condition['script'])
        example_witness = [
            parse_hex_bytes(s) for s in
            spending_condition['exampleWitness'][0]  # ??? what index
        ]
        input_witnesses = [
            CTxInWitness(CScriptWitness(
                stack=[
                    *example_witness,
                    prover_signature,
                    verifier_signature,
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
        assert mempool_accept[0]['allowed'], mempool_accept

        tx_id = bitcoin_rpc.call(
            'sendrawtransaction',
            serialized_tx,
        )
        print(tx_id)
        assert tx_id == tx_template.txId
        bitcoin_rpc.mine_blocks()


def _sign_input(
    *,
    script: CScript,
    tx: CTransaction,
    input_index: int,
    spent_outputs: list[CTxOut],
    private_key: CKey,
) -> bytes:
    sighash = script.sighash_schnorr(tx, input_index, spent_outputs=spent_outputs)
    return private_key.sign_schnorr_no_tweak(sighash)
