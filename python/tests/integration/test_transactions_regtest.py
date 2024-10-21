import sqlalchemy as sa
from sqlalchemy.orm.session import Session

from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.models import TransactionTemplate
from tests.utils.bitcoin_wallet import BitcoinWallet
from bitsnark.core.fund_transactions import main as fund_txs_main
from bitsnark.core.sign_transactions import main as sign_txs_main
from bitsnark.core.parsing import parse_hex_str


def test_transactions_regtest(
    btc_rpc: BitcoinRPC,
    btc_wallet: BitcoinWallet,
    dbsession: Session,
):
    change_address = btc_wallet.get_new_address()

    # Fund the wallet with BTC
    btc_wallet.mine(blocks=102)

    fund_txs_main([
        '--rpc', btc_wallet.rpc.url,
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_prover_1',
        '--fee-rate', '20',
        '--change-address', change_address,
        'locked_funds',
        'prover_stake',
    ])

    sign_txs_main([
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_prover_1',
        '--role', 'prover',
        '--no-mocks',
    ])

    with dbsession.begin():
        tx_templates = dbsession.scalars(
            sa.select(TransactionTemplate).filter_by(
                setupId='test_setup',
                agentId='bitsnark_prover_1',
            ).order_by(
                TransactionTemplate.ordinal,
            )
        ).all()
        for i, tx_template in enumerate(tx_templates):
            external = tx_template.object.get('external')
            print(f"Sending {'external' if external else 'internal'} #{i}: {tx_template.name}")
            if external:
                raw_tx_hex = parse_hex_str(tx_template.object['signedSerializedTx'])
                ret = btc_rpc.call(
                    'sendrawtransaction',
                    raw_tx_hex,
                )
                print(ret)
                btc_rpc.mine_blocks()
            else:
                # TODO
                pass

