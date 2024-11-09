import argparse
import os
from dataclasses import dataclass
from typing import Literal

from bitcointx.core import CTransaction, COutPoint, CTxIn, CTxOut
from bitcointx.core.script import CScript
from bitcointx.core.key import CPubKey, CKey
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.core.parsing import parse_bignum, parse_hex_bytes, serialize_hex
from .models import TransactionTemplate, Outgoing, Setups, OutgoingStatus, SetupStatus

Role = Literal['prover', 'verifier']


@dataclass
class MockInput:
    txid: str
    vout: int
    amount: int
    script_pubkey: str
    tapscript: str


#Temp solution
IGNORED_TX_NAME = 'proof_refuted'

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
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='postgresql://postgres:1234@localhost:5432/postgres')
    parser.add_argument('--all', action='store_true',
                        help='Process all transaction templates (get role from agent id)')
    parser.add_argument('--setup-id', required=False,
                        help='Process only transactions with this setup ID. Required if --all is not set')
    parser.add_argument('--agent-id', required=False,
                        help='Process only transactions with this agent ID. Required if --all is not set')
    parser.add_argument('--role', required=False, choices=['prover', 'verifier'],
                        help='Role of the agent (prover or verifier). Required if --all is not set')

    args = parser.parse_args()

    if args.all:
        if args.setup_id or args.agent_id:
            parser.error("Cannot use --all together with --setup-id or --agent-id")
    else:
        if not args.setup_id:
            parser.error("Must specify --setup-id if --all is not set")
        if not args.agent_id:
            parser.error("Must specify --agent-id if --all is not set")
        if not args.role:
            parser.error("Must specify --role if --all is not set")

    engine = create_engine(args.db)
    dbsession = Session(engine, autobegin=True)
    outgoing = []
    successes = []
    failures = []

    tx_template_query = (select(TransactionTemplate).order_by(TransactionTemplate.ordinal))

    if not args.all:
        tx_template_query = tx_template_query.filter(
            TransactionTemplate.setup_id == args.setup_id,
            TransactionTemplate.agent_id == args.agent_id,
        )

    with dbsession.begin():
        tx_templates = dbsession.execute(tx_template_query).scalars().all()
        tx_template_map: Dict[str, TransactionTemplate] = {}

        print (f"tx_template_map: {tx_template_map}")
        print(f"Processing {len(tx_templates)} transaction templates...")

        for tx in tx_templates:

            if args.all:
                if 'verifier' in tx.agent_id:
                    role = 'verifier'
                elif 'prover' in tx.agent_id:
                    role = 'prover'
                else:
                    raise ValueError(f"Cannot determine role from agent ID {tx.agent_id}")
            else:
                role = args.role

            print(f"Processing transaction #{tx.ordinal}: {tx.name}...")
            success = _handle_tx_template(
                dbsession=dbsession,
                tx_template=tx,
                role=role,
                tx_template_map=tx_template_map,
            )
            if success:
                successes.append(tx.name)
                outgoing.append(
                    Outgoing(
                        transaction_id=tx.tx_id,
                        template_id=tx.template_id,
                        status=OutgoingStatus.PENDING,
                        raw_tx=tx.object,
                        data={})
                )
                print(f"OK! {tx.tx_id}")
            else:
                failures.append(tx.name)
                print("FAIL.")
            print("")
    if len(failures) <= 1:
        dbsession.bulk_save_objects(outgoing)

        dbsession.execute(
            update(Setups)
            .where(Setups.setup_id == args.setup_id)
            .values(status=SetupStatus.SIGNED)
        )

        dbsession.commit()

    dbsession.close()

    print("")
    print("All done.")
    print("")
    print(f"Successes: {len(successes)}")
    print(', '.join(successes))
    print("")
    print(f"Failures:  {len(failures)}")
    print(', '.join(failures))


def _handle_tx_template(
    *,
    dbsession: Session,
    tx_template: TransactionTemplate,
    role: Role,
    tx_template_map: dict[int, TransactionTemplate],
):
    if tx_template.is_external:
        # assert len(tx_template.inputs) == 0  # cannot do it, this script might have been already run
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
            prev_tx = tx_template_map.get(inp['transactionName'])
            if not prev_tx:
                raise KeyError(f"Transaction {inp['transactionName']} not found")

            print(f"Processing input #{input_index} of transaction {inp['transactionName']} ...")

            prev_txid = prev_tx.tx_id
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
    tx_template.tx_id = tx_id
    tx_template.object['txId'] = tx_id
    tx_template.object['serializedTx'] = serialize_hex(serialized)
    for i, inp in enumerate(tx_inputs):
        signature = _sign_input(
            script=input_tapscripts[i],
            tx=tx,
            input_index=i,
            spent_outputs=spent_outputs,
            private_key=KEYPAIRS[tx_template.agent_id]['private'],
        )
        if len(tx_template.object['inputs']) <= i:
            # HACK: the hardcoded initial transactions have an empty list of inputs
            tx_template.object['inputs'].append({})

        if role == 'prover':
            role_signature_key = 'proverSignature'
        elif role == 'verifier':
            role_signature_key = 'verifierSignature'
        else:
            raise ValueError(f"Unknown role {role}")
        tx_template.object['inputs'][i][role_signature_key] = serialize_hex(signature)

    # Make sure SQLAlchemy knows that the JSON object has changed
    flag_modified(tx_template, 'object')

    tx_template_map[tx_template.name] = tx_template
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
