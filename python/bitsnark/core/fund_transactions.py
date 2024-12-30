import argparse
from decimal import Decimal
from typing import Sequence

from bitcointx import ChainParams
from bitcointx.core.script import CScript
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.wallet import CCoinAddress
from sqlalchemy import create_engine, select
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes, serialize_hex
from .models import TransactionTemplate
from ..btc.rpc import BitcoinRPC, JSONRPCError


def fund_transactions(
    dbsession: Session,
    bitcoin_rpc: BitcoinRPC,
    setup_id: str,
    tx_names: Sequence[str],
    fee_rate: int,
    change_address: str = None,
):
    blockchain_info = bitcoin_rpc.call('getblockchaininfo')
    if blockchain_info['chain'] == 'regtest':
        chain = 'bitcoin/regtest'
    elif blockchain_info['chain'] == 'test':
        chain = 'bitcoin/testnet'
    elif blockchain_info['chain'] == 'main':
        chain = 'bitcoin/mainnet'
    else:
        raise ValueError(f"Unknown chain {blockchain_info['chain']}")
    print(f"Funding transactions: {tx_names} on {chain}")

    if change_address == 'generate' or change_address is None:
        change_address = bitcoin_rpc.call('getnewaddress')
        print(f"Generated a new change address: {change_address}")

    inputs_to_unlock: list[tuple[str, int]] = []  # txid, vout
    with ChainParams(chain):
        try:
            tx_templates_and_outputs: list[tuple[TransactionTemplate, list[dict[str, str]]]] = []
            for tx_name in tx_names:
                tx_template = dbsession.execute(
                    select(TransactionTemplate).filter_by(
                        setup_id=setup_id,
                        name=tx_name,
                    )
                ).scalar_one()
                print("Funding", tx_template)

                outputs = []
                for output_index, out in enumerate(tx_template.outputs):
                    amount_raw = out.get('amount')
                    script_pubkey_raw = out.get('taprootKey')
                    keys = ", ".join(out.keys())

                    if amount_raw is None:
                        raise ValueError(
                            f"Transaction {tx_template.name} output {output_index} has no amount. Keys: {keys}")
                    if script_pubkey_raw is None:
                        raise ValueError(
                            f"Transaction {tx_template.name} output {output_index} has no taprootKey. Keys: {keys}")

                    amount = parse_bignum(amount_raw)
                    amount_dec = Decimal(amount) / Decimal(10**8)
                    script_pubkey = CScript(parse_hex_bytes(script_pubkey_raw))
                    address = CCoinAddress.from_scriptPubKey(script_pubkey)
                    outputs.append({
                        str(address): str(amount_dec),
                    })

                tx_templates_and_outputs.append((tx_template, outputs))

            for tx_template, outputs in tx_templates_and_outputs:
                change_index = len(outputs)

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
                        'lockUnspents': True,
                    }
                )
                print('walletcreatefundedpsbt', ret)

                unsigned_psbt_raw = ret['psbt']
                unsigned_psbt = PartiallySignedTransaction.from_base64(unsigned_psbt_raw)
                inputs_to_unlock.extend(
                    (inp.utxo.GetTxid()[::-1].hex(), inp.index)
                    for inp in unsigned_psbt.inputs
                )

                ret = bitcoin_rpc.call(
                    'walletprocesspsbt',
                    unsigned_psbt_raw,
                )
                if not ret['complete']:
                    raise ValueError(f"PSBT not complete: {ret}")
                print('walletprocesspsbt', ret)
                signed_psbt = PartiallySignedTransaction.from_base64(ret['psbt'])
                tx = signed_psbt.extract_transaction()

                txid = tx.GetTxid()[::-1].hex()
                tx_template.txid = txid
                tx_template.is_external = True
                tx_template.tx_data = dict(
                    tx_template.tx_data or {}, signedSerializedTx=serialize_hex(tx.serialize())
                )
                flag_modified(tx_template, 'txid')
                flag_modified(tx_template, 'is_external')
        finally:
            # Lock all previously locked utxos
            for (txid, vout) in inputs_to_unlock:
                try:
                    bitcoin_rpc.call('lockunspent', False, [{
                        'txid': txid,
                        'vout': vout,
                    }])
                except JSONRPCError:
                    continue


def main(argv: Sequence[str] = None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=POSTGRES_BASE_URL)
    parser.add_argument('--rpc', help='Bitcoin RPC url including the wallet',
                        default='http://rpcuser:rpcpassword@localhost:18443/wallet/testwallet')
    parser.add_argument('--setup-id', required=True,
                        help='Process only transactions with this setup ID. Required if --all is not set')
    parser.add_argument('--agent-id', required=True,
                        help='Process only transactions with this agent ID. Required if --all is not set')
    parser.add_argument('--fee-rate', required=True,
                        help='Fee rate sat/vB')
    parser.add_argument('--change-address', required=True,
                        help='Change address ("generate" to generate a new one)')
    parser.add_argument('tx_names', nargs="+",
                        help='Name of the transaction template to fund. Specify multiple to fund multiple.')

    args = parser.parse_args(argv)

    engine = create_engine(f"{args.db}/{args.agent_id}")
    dbsession = Session(engine, autobegin=False)

    bitcoin_rpc = BitcoinRPC(args.rpc)

    fund_transactions(
        dbsession, bitcoin_rpc, args.setup_id, args.tx_names, args.fee_rate, args.change_address)


if __name__ == "__main__":
    main()
