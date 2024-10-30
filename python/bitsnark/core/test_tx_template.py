import argparse
import os
import sys
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal, Sequence

from bitcointx import ChainParams
from bitcointx.core import CTransaction, COutPoint, CTxIn, CTxOut
from bitcointx.core.script import CScript
from bitcointx.core.key import CPubKey, CKey
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.wallet import CCoinAddress
from sqlalchemy import create_engine, select
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes, serialize_hex
from bitsnark.utils import pprint_json_structure
from .models import TransactionTemplate

COMMANDS = {}


def command(func):
    COMMANDS[func.__name__] = func
    return func


def main(argv: Sequence[str] = None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', help='database url',
                        default='postgresql://postgres:1234@localhost:5432/postgres')
    parser.add_argument('--rpc', help='bitcoin rpc url, including wallet',
                        default='http://rpcuser:rpcpassword@localhost:18443/wallet/testwallet')
    parser.add_argument('--setup-id', required=True, help='Setup ID of the tx template')
    parser.add_argument('--agent-id', required=True, help='Agent ID of the tx template')
    parser.add_argument('--name', required=True, help='Name of the tx template')
    parser.add_argument('command', choices=COMMANDS.keys())
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
            try:
                tx_template = dbsession.execute(
                    select(TransactionTemplate).filter_by(
                        setupId=args.setup_id,
                        agentId=args.agent_id,
                        name=args.name,
                    )
                ).scalar_one()
            except NoResultFound:
                sys.exit(f"Transaction template with setup ID {args.setup_id}, agent ID {args.agent_id} and name {args.name} not found")

            print(tx_template)
            pprint_json_structure(tx_template.object)
            COMMANDS[args.command](tx_template=tx_template, bitcoin_rpc=bitcoin_rpc)


@command
def verify_outputs(
    *,
    tx_template: TransactionTemplate,
    bitcoin_rpc: BitcoinRPC,
    fee_rate: int = 10,
):
    """
    Send a transaction with identical outputs but inputs from the wallet. Verify that outputs can be spent.
    """
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

    print(f"Funding transaction with identical outputs to {tx_template.name}")

    ret = bitcoin_rpc.call(
        'walletcreatefundedpsbt',
        [],  # Inputs
        outputs,  # Outputs
        0,  # Locktime
        {
            'add_inputs': True,
            'changeAddress': change_address,
            'changePosition': change_index,
            'fee_rate': fee_rate,
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

    print(f"Testing mempool acceptance")
    mempool_accept = bitcoin_rpc.call(
        'testmempoolaccept',
        [serialized_tx],
    )
    assert mempool_accept[0]['allowed'], mempool_accept

    print(f"Broadcasting transaction")
    tx_id = bitcoin_rpc.call(
        'sendrawtransaction',
        serialized_tx,
    )
    # print(tx_id)
    assert tx_id == tx.GetTxid()[::-1].hex()
    bitcoin_rpc.mine_blocks()


if __name__ == "__main__":
    main()
