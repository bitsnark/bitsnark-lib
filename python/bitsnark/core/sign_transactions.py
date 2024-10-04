import os
from dataclasses import dataclass

from bitcointx.core import CTransaction, COutPoint, CTxIn, CTxOut
from bitcointx.core.script import CScript
from bitcointx.core.key import CPubKey, CKey
from sqlalchemy import create_engine, select
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.core.parsing import parse_bignum, parse_hex_bytes, serialize_hex
from .models import TransactionTemplate


@dataclass
class MockInput:
    txid: str
    vout: int
    amount: int
    script_pubkey: str
    tapscript: str


# Mocked inputs for the very first transactions
# These should eventually come from somewhere else
HARDCODED_MOCK_INPUTS: dict[str, list[MockInput]] = {
    'locked_funds': [
        MockInput(
            txid='0000000000000000000000000000000000000000000000000000000000000001',
            vout=0,
            amount=10 * 10**8,
            script_pubkey='51208506de70905b34248b9c81d1eb02be64af16c90c26046a3d3ada074bde10d792',
            tapscript='51ad52ad51'
        )
    ],
    'prover_stake': [
        MockInput(
            txid='0000000000000000000000000000000000000000000000000000000000000002',
            vout=0,
            amount=2 * 10**8,
            script_pubkey='51208506de70905b34248b9c81d1eb02be64af16c90c26046a3d3ada074bde10d792',
            tapscript='51ad52ad51'
        )
    ],
}

# Copied from agent.conf.ts
KEYPAIRS = {
    'bitsnark_prover_1': {
        'public': CPubKey.fromhex(os.getenv('PROVER_SCHNORR_PUBLIC', '02ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75')),
        'private': CKey.fromhex(os.getenv('PROVER_SCHNORR_PRIVATE', '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2')),
    },
    'bitsnark_verifier_1': {
        'public': CPubKey.fromhex(os.getenv('VERIFIER_SCHNORR_PUBLIC', '0386ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79')),
        'private': CKey.fromhex(os.getenv('VERIFIER_SCHNORR_PRIVATE', 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0')),
    },
}
for keypairs in KEYPAIRS.values():
    assert keypairs['public'] == keypairs['private'].pub


def main():
    engine = create_engine("postgresql://postgres:1234@localhost:5432/postgres")
    dbsession = Session(engine, autobegin=False)
    successes = []
    failures = []

    with dbsession.begin():
        transactions = dbsession.execute(
            select(TransactionTemplate).order_by(TransactionTemplate.ordinal)
        ).scalars()

        for tx in transactions:
            print(f"Processing transaction #{tx.ordinal}: {tx.name}...")
            success = _handle_tx(
                dbsession=dbsession,
                tx_template=tx,
            )
            if success:
                successes.append(tx.name)
                print("OK!")
            else:
                failures.append(tx.name)
                print("FAIL.")
            print("")

    print("")
    print("All done.")
    print("")
    print(f"Successes: {len(successes)}")
    print(', '.join(successes))
    print("")
    print(f"Failures:  {len(failures)}")
    print(', '.join(failures))


def _handle_tx(
    *,
    dbsession: Session,
    tx_template: TransactionTemplate
):
    if tx_template.name in HARDCODED_MOCK_INPUTS:
        assert len(tx_template.inputs) == 0
        tx_inputs: list[CTxIn]  = [
            CTxIn(
                COutPoint(
                    hash=bytes.fromhex(inp.txid)[::-1],
                    n=inp.vout,
                )
            )
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
        spent_outputs: list[CTxOut]  = [
            CTxOut(
                nValue=inp.amount,
                scriptPubKey=CScript.fromhex(inp.script_pubkey)
            )
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
        input_tapscripts: list[CScript]  = [
            CScript.fromhex(inp.tapscript)
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
    else:
        tx_inputs: list[CTxIn] = []
        spent_outputs: list[CTxOut] = []
        input_tapscripts: list[CScript] = []
        for input_index, inp in enumerate(tx_template.inputs):
            prev_tx = dbsession.get(
                TransactionTemplate,
                (tx_template.agentId, tx_template.setupId, inp['transactionName'])
            )
            if not prev_tx:
                raise KeyError(f"Transaction {inp['transactionName']} not found")

            prev_txid = prev_tx.txId
            if not prev_txid:
                raise ValueError(f"Transaction {inp['transactionName']} has no txId")

            prevout_index = inp['outputIndex']
            prevout = prev_tx.outputs[prevout_index]

            tx_inputs.append(
                CTxIn(
                    COutPoint(
                        hash=bytes.fromhex(prev_txid)[::-1],
                        n=inp['outputIndex'],
                    )
                )
            )

            spent_outputs.append(CTxOut(
                nValue=parse_bignum(prevout['amount']),
                scriptPubKey=CScript(parse_hex_bytes(prevout['taprootKey']))
            ))

            spending_condition = prevout['spendingConditions'][inp['spendingConditionIndex']]
            script_raw = spending_condition.get('script')
            if script_raw is None:
                print(
                    f"Spending condition {inp['spendingConditionIndex']} for transaction {prev_tx.name} "
                    f"(required by {tx_template.name} input #{input_index}) has no script"
                )
                return False

            input_tapscripts.append(
                CScript(parse_hex_bytes(script_raw))
            )

    tx_outputs = []
    for output_index, out in enumerate(tx_template.outputs):
        amount_raw = out.get('amount')
        script_pubkey_raw = out.get('taprootKey')
        keys = ", ".join(out.keys())

        if amount_raw is None:
            print(f"Transaction {tx_template.name} output {output_index} has no amount. Keys: {keys}")
            return False
        if script_pubkey_raw is None:
            print(f"Transaction {tx_template.name} output {output_index} has no taprootKey. Keys: {keys}")
            return False

        amount = parse_bignum(amount_raw)
        script_pubkey = CScript(parse_hex_bytes(script_pubkey_raw))
        tx_outputs.append(
            CTxOut(
                nValue=amount,
                scriptPubKey=script_pubkey,
            )
        )

    tx = CTransaction(
        vin=tx_inputs,
        vout=tx_outputs,
        nVersion=2,
    )

    # TODO: check the endianness (BE/LE) of tx_hash / txid
    tx_hash = tx.GetTxid()
    tx_id = tx_hash.hex()

    serialized = tx.serialize()

    # Alter the template
    tx_template.txId = tx_id
    tx_template.object['txId'] = tx_id
    tx_template.object['serializedTx'] = serialize_hex(serialized)
    for i, inp in enumerate(tx_inputs):
        signature = _sign_input(
            script=input_tapscripts[i],
            tx=tx,
            input_index=i,
            spent_outputs=spent_outputs,
            private_key=KEYPAIRS[tx_template.agentId]['private'],
        )
        if len(tx_template.object['inputs']) <= i:
            # HACK: the hardcoded initial transactions have an empty list of inputs
            tx_template.object['inputs'].append({})
        tx_template.object['inputs'][i]['signature'] = serialize_hex(signature)

    # Make sure SQLAlchemy knows that the JSON object has changed
    flag_modified(tx_template, 'object')

    return True


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


if __name__ == "__main__":
    main()