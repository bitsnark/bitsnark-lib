import sqlalchemy as sa
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitcointx.core import CTransaction, CMutableTransaction, CTxWitness, CTxInWitness
from bitcointx.core.script import CScriptWitness, CScript
from bitsnark.btc.rpc import BitcoinRPC
from bitsnark.core.models import TransactionTemplate
from tests.utils.bitcoin_wallet import BitcoinWallet
from bitsnark.core.fund_transactions import main as fund_txs_main
from bitsnark.core.sign_transactions import main as sign_txs_main
from bitsnark.core.parsing import parse_hex_str, parse_hex_bytes


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

    with dbsession.begin():
        for name in ['locked_funds', 'prover_stake']:
            prover_tx_template = dbsession.execute(
                sa.select(TransactionTemplate).filter_by(
                    setupId='test_setup',
                    agentId='bitsnark_prover_1',
                    name=name,
                )
            ).scalar_one()
            verifier_tx_template = dbsession.execute(
                sa.select(TransactionTemplate).filter_by(
                    setupId='test_setup',
                    agentId='bitsnark_verifier_1',
                    name=name,
                )
            ).scalar_one()
            verifier_tx_template.txId = prover_tx_template.txId
            verifier_tx_template.object['txId'] = prover_tx_template.object['txId']

    sign_txs_main([
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_prover_1',
        '--role', 'prover',
        '--no-mocks',
    ])

    sign_txs_main([
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_verifier_1',
        '--role', 'verifier',
        '--no-mocks',
    ])

    with dbsession.begin():
        prover_tx_templates = dbsession.scalars(
            sa.select(TransactionTemplate).filter_by(
                setupId='test_setup',
                agentId='bitsnark_prover_1',
            ).order_by(
                TransactionTemplate.ordinal,
            )
        ).all()
        verifier_tx_templates = dbsession.scalars(
            sa.select(TransactionTemplate).filter_by(
                setupId='test_setup',
                agentId='bitsnark_verifier_1',
            ).order_by(
                TransactionTemplate.ordinal,
            )
        ).all()
        for i, (prover_tx_template, verifier_tx_template) in enumerate(zip(prover_tx_templates, verifier_tx_templates)):
            assert prover_tx_template.ordinal == verifier_tx_template.ordinal
            assert prover_tx_template.name == verifier_tx_template.name
            assert prover_tx_template.object.get('external') == verifier_tx_template.object.get('external')

            for prover_input, verifier_input in zip(prover_tx_template.inputs, verifier_tx_template.inputs):
                assert prover_input.get('transactionName') == verifier_input.get('transactionName')
                assert prover_input.get('outputIndex') == verifier_input.get('outputIndex')
                assert prover_input.get('spendingConditionIndex') == verifier_input.get('spendingConditionIndex')
                assert prover_input.get('script') == verifier_input.get('script')
                prover_input['verifierSignature'] = verifier_input['verifierSignature']
                verifier_input['proverSignature'] = prover_input['proverSignature']

            flag_modified(prover_tx_template, 'object')
            flag_modified(verifier_tx_template, 'object')

            tx_template = prover_tx_template

            external = tx_template.object.get('external')
            print(f"Sending {'external' if external else 'protocol'} tx #{i}: {tx_template.name}")
            if external:
                raw_tx_hex = parse_hex_str(tx_template.object['signedSerializedTx'])
                tx_id = btc_rpc.call(
                    'sendrawtransaction',
                    raw_tx_hex,
                )
                print(tx_id)
                assert tx_id == tx_template.txId
                btc_rpc.mine_blocks()
            else:
                tx = CMutableTransaction.deserialize(parse_hex_bytes(tx_template.object['serializedTx']))
                input_witnesses = []
                for inp in tx_template.inputs:
                    prev_tx_template = dbsession.get(
                        TransactionTemplate,
                        (tx_template.agentId, tx_template.setupId, inp['transactionName'])
                    )
                    spending_condition = prev_tx_template.outputs[inp['outputIndex']]['spendingConditions'][inp['spendingConditionIndex']]
                    example_witness = spending_condition['exampleWitness'][inp['outputIndex']]
                    control_block = parse_hex_bytes(spending_condition['controlBlock'])
                    tapscript = parse_hex_bytes(spending_condition['script'])
                    input_witness_elems = [
                        parse_hex_bytes(s) for s in example_witness
                    ]
                    input_witness_elems = [
                        *input_witness_elems,
                        parse_hex_bytes(inp['proverSignature']),
                        parse_hex_bytes(inp['verifierSignature']),
                        tapscript,
                        control_block,
                    ]
                    input_witnesses.append(CTxInWitness(CScriptWitness(
                        stack=input_witness_elems,
                    )))

                tx.wit = CTxWitness(vtxinwit=input_witnesses)

                serialized_tx = tx.serialize().hex()
                mempool_accept = btc_rpc.call(
                    'testmempoolaccept',
                    [serialized_tx],
                )
                assert mempool_accept[0]['allowed'], mempool_accept

                tx_id = btc_rpc.call(
                    'sendrawtransaction',
                    serialized_tx,
                )
                print(tx_id)
                assert tx_id == tx_template.txId
                btc_rpc.mine_blocks()


def test_scripts_regtest(
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

    with dbsession.begin():
        for name in ['locked_funds', 'prover_stake']:
            prover_tx_template = dbsession.execute(
                sa.select(TransactionTemplate).filter_by(
                    setupId='test_setup',
                    agentId='bitsnark_prover_1',
                    name=name,
                )
            ).scalar_one()
            verifier_tx_template = dbsession.execute(
                sa.select(TransactionTemplate).filter_by(
                    setupId='test_setup',
                    agentId='bitsnark_verifier_1',
                    name=name,
                )
            ).scalar_one()
            verifier_tx_template.txId = prover_tx_template.txId
            verifier_tx_template.object['txId'] = prover_tx_template.object['txId']

    sign_txs_main([
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_prover_1',
        '--role', 'prover',
        '--no-mocks',
    ])
    sign_txs_main([
        '--setup-id', 'test_setup',
        '--agent-id', 'bitsnark_verifier_1',
        '--role', 'verifier',
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

        for tx_template in tx_templates:
            external = tx_template.object.get('external')
            if external:
                continue
            print(f"Sending tx #{tx_template.ordinal}: {tx_template.name}")
            tx = CTransaction.deserialize(parse_hex_bytes(tx_template.object['serializedTx']))

        verifier_tx_templates = dbsession.scalars(
            sa.select(TransactionTemplate).filter_by(
                setupId='test_setup',
                agentId='bitsnark_verifier_1',
            ).order_by(
                TransactionTemplate.ordinal,
            )
        ).all()
        for i, (prover_tx_template, verifier_tx_template) in enumerate(zip(prover_tx_templates, verifier_tx_templates)):
            assert prover_tx_template.ordinal == verifier_tx_template.ordinal
            assert prover_tx_template.name == verifier_tx_template.name
            assert prover_tx_template.object.get('external') == verifier_tx_template.object.get('external')

            for prover_input, verifier_input in zip(prover_tx_template.inputs, verifier_tx_template.inputs):
                assert prover_input.get('transactionName') == verifier_input.get('transactionName')
                assert prover_input.get('outputIndex') == verifier_input.get('outputIndex')
                assert prover_input.get('spendingConditionIndex') == verifier_input.get('spendingConditionIndex')
                assert prover_input.get('script') == verifier_input.get('script')
                prover_input['verifierSignature'] = verifier_input['verifierSignature']
                verifier_input['proverSignature'] = prover_input['proverSignature']

            flag_modified(prover_tx_template, 'object')
            flag_modified(verifier_tx_template, 'object')

            tx_template = prover_tx_template

            external = tx_template.object.get('external')
            print(f"Sending {'external' if external else 'protocol'} tx #{i}: {tx_template.name}")
            if external:
                raw_tx_hex = parse_hex_str(tx_template.object['signedSerializedTx'])
                tx_id = btc_rpc.call(
                    'sendrawtransaction',
                    raw_tx_hex,
                )
                print(tx_id)
                assert tx_id == tx_template.txId
                btc_rpc.mine_blocks()
            else:
                tx = CMutableTransaction.deserialize(parse_hex_bytes(tx_template.object['serializedTx']))
                input_witnesses = []
                for inp in tx_template.inputs:
                    prev_tx_template = dbsession.get(
                        TransactionTemplate,
                        (tx_template.agentId, tx_template.setupId, inp['transactionName'])
                    )
                    spending_condition = prev_tx_template.outputs[inp['outputIndex']]['spendingConditions'][inp['spendingConditionIndex']]
                    example_witness = spending_condition['exampleWitness'][inp['outputIndex']]
                    control_block = parse_hex_bytes(spending_condition['controlBlock'])
                    tapscript = parse_hex_bytes(spending_condition['script'])
                    input_witness_elems = [
                        parse_hex_bytes(s) for s in example_witness
                    ]
                    input_witness_elems = [
                        *input_witness_elems,
                        parse_hex_bytes(inp['proverSignature']),
                        parse_hex_bytes(inp['verifierSignature']),
                        tapscript,
                        control_block,
                    ]
                    input_witnesses.append(CTxInWitness(CScriptWitness(
                        stack=input_witness_elems,
                    )))

                tx.wit = CTxWitness(vtxinwit=input_witnesses)

                serialized_tx = tx.serialize().hex()
                mempool_accept = btc_rpc.call(
                    'testmempoolaccept',
                    [serialized_tx],
                )
                assert mempool_accept[0]['allowed'], mempool_accept

                tx_id = btc_rpc.call(
                    'sendrawtransaction',
                    serialized_tx,
                )
                print(tx_id)
                assert tx_id == tx_template.txId
                btc_rpc.mine_blocks()
