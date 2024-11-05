import argparse
from decimal import Decimal

from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.core.script import CScript
from bitcointx.wallet import CCoinAddress

from bitsnark.core.parsing import parse_bignum, parse_hex_bytes
from ._base import Command, add_tx_template_args, find_tx_template, Context


class FundAndSendCommand(Command):
    """
    Send a transaction with identical outputs but inputs from the wallet
    """
    name = 'fund_and_send'

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)
        parser.add_argument('--fee-rate', help='Fee rate in sat/vb', type=float, default=10)
        parser.add_argument('--change-address', help='Address to send the change to', required=False)

    def run(
        self,
        context: Context,
    ):

        tx_template = find_tx_template(context)
        bitcoin_rpc = context.bitcoin_rpc
        change_address = context.args.change_address
        if not change_address:
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
