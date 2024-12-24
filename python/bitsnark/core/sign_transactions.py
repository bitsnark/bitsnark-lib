import argparse
import os
import sys
from dataclasses import dataclass
from typing import Literal, Sequence

from bitcointx.core import CTransaction, COutPoint, CTxIn, CTxOut
from bitcointx.core.script import CScript
from bitcointx.core.key import CKey, XOnlyPubKey
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm.session import Session
from sqlalchemy.orm.attributes import flag_modified

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.core.parsing import parse_bignum, parse_hex_bytes, serialize_hex
from .models import TransactionTemplate, Setups, SetupStatus, OutgoingStatus
from .signing import sign_input

Role = Literal['prover', 'verifier']


@dataclass
class MockInput:
    txid: str
    vout: int
    amount: int
    script_pubkey: str
    tapscript: str


class TransactionProcessingError(Exception):
    pass


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
        'public': XOnlyPubKey.fromhex(
            os.getenv('PROVER_SCHNORR_PUBLIC', 'ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75')),
        'private': CKey.fromhex(
            os.getenv('PROVER_SCHNORR_PRIVATE', '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2')),
    },
    'bitsnark_verifier_1': {
        'public': XOnlyPubKey.fromhex(
            os.getenv('VERIFIER_SCHNORR_PUBLIC', '86ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79')),
        'private': CKey.fromhex(
            os.getenv('VERIFIER_SCHNORR_PRIVATE', 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0')),
    },
}
for keypairs in KEYPAIRS.values():
    assert keypairs['public'] == XOnlyPubKey(keypairs['private'].pub)


def sign_setup(setup_id: str, agent_id: str, role: Role, dbsession: Session, no_mocks: bool = False):
    successes = []

    tx_template_query = (select(TransactionTemplate).order_by(TransactionTemplate.ordinal))

    tx_template_query = tx_template_query.filter(
        TransactionTemplate.setup_id == setup_id
    )

    with dbsession.begin():
        tx_templates = dbsession.execute(tx_template_query).scalars().all()
        tx_template_map: dict[str, TransactionTemplate] = {}

        print(f"tx_template_map: {tx_template_map}")
        print(f"Processing {len(tx_templates)} transaction templates...")

        for tx in tx_templates:
            print(f"Processing transaction #{tx.ordinal}: {tx.name}...")
            success = _handle_tx_template(
                tx_template=tx,
                role=role,
                agent_id=agent_id,
                tx_template_map=tx_template_map,
                use_mocked_inputs=not no_mocks,
            )
            if success:
                successes.append(tx.name)
                print(f"OK! {tx.txid}")
            else:
                # The script that will be used in the PROOF_REFUTED tx is undetermined at this point.
                # This is a temporary fix until we figure out exactly what needs to be signed and when.
                if tx.name == "PROOF_REFUTED":
                    sys.stderr.write(f"FAIL! Hard-coded to ignore {tx.name}\n")
                else:
                    raise TransactionProcessingError(f"Rollback: Failed signing {tx.name}")

            print("")

        dbsession.execute(
            update(Setups)
            .where(Setups.id == setup_id)
            .values(status=SetupStatus.SIGNED)
        )

        # Print the final summary
        print("")
        print("All done.")
        print("")
        print(f"Successes: {len(successes)}")
        print(', '.join(successes))


def main(argv: Sequence[str] = None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=POSTGRES_BASE_URL)
    parser.add_argument('--setup-id', required=True,
                        help='Process only transactions with this setup ID')
    parser.add_argument('--agent-id', required=True,
                        help='Process only transactions with this agent ID')
    parser.add_argument('--role', required=True, choices=['prover', 'verifier'],
                        help='Role of the agent (prover or verifier)')
    parser.add_argument('--no-mocks', default=False, action='store_true', help="Don't use mock inputs")

    args = parser.parse_args(argv)

    if not args.setup_id:
        parser.error("Must specify --setup-id")
    if not args.agent_id:
        parser.error("Must specify --agent-id")
    if not args.role:
        parser.error("Must specify --role")

    engine = create_engine(f"{args.db}/{args.agent_id}")
    dbsession = Session(engine)
    sign_setup(args.setup_id, args.agent_id, args.role, dbsession, args.no_mocks)


def _handle_tx_template(
    *,
    tx_template: TransactionTemplate,
    role: Role,
    agent_id: str,
    tx_template_map: dict[int, TransactionTemplate],
    use_mocked_inputs: bool = True,
):
    if tx_template.is_external:
        # Requierd for signing next transactions
        tx_template.txid = tx_template.txid
        tx_template_map[tx_template.name] = tx_template
        if not use_mocked_inputs:
            # We don't want to sign external transactions
            return True

    if use_mocked_inputs and tx_template.name in HARDCODED_MOCK_INPUTS:
        # assert len(tx_template.inputs) == 0  # cannot do it, this script might have been already run
        tx_inputs: list[CTxIn] = [
            CTxIn(
                COutPoint(
                    hash=bytes.fromhex(inp.txid)[::-1],
                    n=inp.vout,
                )
            )
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
        spent_outputs: list[CTxOut] = [
            CTxOut(
                nValue=inp.amount,
                scriptPubKey=CScript.fromhex(inp.script_pubkey)
            )
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
        input_tapscripts: list[CScript] = [
            CScript.fromhex(inp.tapscript)
            for inp in HARDCODED_MOCK_INPUTS[tx_template.name]
        ]
    else:
        tx_inputs: list[CTxIn] = []
        spent_outputs: list[CTxOut] = []
        input_tapscripts: list[CScript] = []
        for input_index, inp in enumerate(tx_template.inputs):
            prev_tx = tx_template_map.get(inp['templateName'])
            if not prev_tx:
                raise KeyError(f"Transaction {inp['templateName']} not found")

            print(f"Processing input #{input_index} of transaction {inp['templateName']} ...")

            prev_txid = prev_tx.txid
            if not prev_txid:
                raise ValueError(f"Transaction {inp['templateName']} has no txId")

            prevout_index = inp['outputIndex']
            prevout = prev_tx.outputs[prevout_index]

            try:
                prev_tx_hash = bytes.fromhex(prev_txid)[::-1]
            except ValueError:
                print(
                    f"Invalid txid {prev_txid} for transaction {prev_tx.name} "
                    f"(required by {tx_template.name} input #{input_index})")
                raise

            spending_condition = prevout['spendingConditions'][inp['spendingConditionIndex']]
            timeout_blocks = spending_condition.get('timeoutBlocks')
            sequence = 0xffffffff
            if timeout_blocks is not None:
                sequence = timeout_blocks

            tx_inputs.append(
                CTxIn(
                    prevout=COutPoint(
                        hash=prev_tx_hash,
                        n=inp['outputIndex'],
                    ),
                    nSequence=sequence,
                )
            )

            spent_outputs.append(CTxOut(
                nValue=parse_bignum(prevout['amount']),
                scriptPubKey=CScript(parse_hex_bytes(prevout['taprootKey']))
            ))

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

    txid = tx.GetTxid()[::-1].hex()

    serialized = tx.serialize()

    # Alter the template
    tx_template.txid = txid
    tx_template.tx_data = dict(
        tx_template.tx_data or {}, signedSerializedTx=serialize_hex(tx.serialize())
    )
    for i, inp in enumerate(tx_inputs):
        signature = sign_input(
            script=input_tapscripts[i],
            tx=tx,
            input_index=i,
            spent_outputs=spent_outputs,
            private_key=KEYPAIRS[agent_id]['private'],
        )
        if len(tx_template.inputs) <= i:
            # HACK: the hardcoded initial transactions have an empty list of inputs
            tx_template.inputs.append({})

        if role == 'prover':
            role_signature_key = 'proverSignature'
        elif role == 'verifier':
            role_signature_key = 'verifierSignature'
        else:
            raise ValueError(f"Unknown role {role}")
        tx_template.inputs[i][role_signature_key] = serialize_hex(signature)

    # Make sure SQLAlchemy knows that the JSON object has changed
    flag_modified(tx_template, 'inputs')

    tx_template_map[tx_template.name] = tx_template
    return True


if __name__ == "__main__":
    main()
