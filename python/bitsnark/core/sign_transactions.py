import argparse
import os
import sys
from typing import Sequence

from bitcointx.core.key import CKey, XOnlyPubKey
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm.session import Session

from bitsnark.conf import POSTGRES_BASE_URL
from bitsnark.core.environ import load_bitsnark_dotenv
from bitsnark.core.parsing import serialize_hex
from bitsnark.core.transactions import construct_signable_transaction, MissingScript
from .models import TransactionTemplate, Setups, SetupStatus
from .types import Role


class TransactionProcessingError(Exception):
    pass


def load_keypairs():
    keypairs = {
        'bitsnark_prover_1': {
            'public': XOnlyPubKey.fromhex(os.environ['PROVER_SCHNORR_PUBLIC']),
            'private': CKey.fromhex(os.environ['PROVER_SCHNORR_PRIVATE']),
        },
        'bitsnark_verifier_1': {
            'public': XOnlyPubKey.fromhex(os.environ['VERIFIER_SCHNORR_PUBLIC']),
            'private': CKey.fromhex(os.environ['VERIFIER_SCHNORR_PRIVATE']),
        },
    }
    for role, role_keypairs in keypairs.items():
        pub = role_keypairs['public']
        pub_from_priv = XOnlyPubKey(role_keypairs['private'].pub)
        if pub != pub_from_priv:
            raise ValueError(
                f"Public key {pub_from_priv} derived from private key for {role} does not match the public key {pub} provided"
            )

    return keypairs


def sign_setup(setup_id: str, agent_id: str, role: Role, dbsession: Session):
    # This is a bit silly
    keypairs = load_keypairs()
    private_key = keypairs[agent_id]['private']

    successes = []

    tx_template_query = (select(TransactionTemplate).order_by(TransactionTemplate.ordinal))

    tx_template_query = tx_template_query.filter(
        TransactionTemplate.setup_id == setup_id
    )

    tx_templates = dbsession.execute(tx_template_query).scalars().all()

    print(f"Processing {len(tx_templates)} transaction templates...")

    for tx in tx_templates:
        print(f"Processing transaction #{tx.ordinal}: {tx.name}...")
        try:
            success = _handle_tx_template(
                tx_template=tx,
                role=role,
                private_key=private_key,
                dbsession=dbsession,
            )
        except MissingScript as e:
            sys.stderr.write(f"Warning: {e}")
            success = False

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
    load_bitsnark_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=POSTGRES_BASE_URL)
    parser.add_argument('--setup-id', required=True,
                        help='Process only transactions with this setup ID')
    parser.add_argument('--agent-id', required=True,
                        help='Process only transactions with this agent ID')
    parser.add_argument('--role', required=True, choices=['prover', 'verifier'],
                        help='Role of the agent (prover or verifier)')

    args = parser.parse_args(argv)

    if not args.setup_id:
        parser.error("Must specify --setup-id")
    if not args.agent_id:
        parser.error("Must specify --agent-id")
    if not args.role:
        parser.error("Must specify --role")

    engine = create_engine(f"{args.db}/{args.agent_id}")
    dbsession = Session(engine)
    sign_setup(args.setup_id, args.agent_id, args.role, dbsession)


def _handle_tx_template(
    *,
    tx_template: TransactionTemplate,
    role: Role,
    private_key: CKey,
    dbsession: Session,
):
    if tx_template.is_external:
        # We don't want to sign external transactions
        return True

    signable_tx = construct_signable_transaction(
        tx_template=tx_template,
        dbsession=dbsession,
    )

    # Alter the template
    tx_template.txid = signable_tx.txid

    for signable_input in signable_tx.inputs:
        index = signable_input.index
        signature = signable_input.sign(
            private_key=private_key,
        )

        if role == 'prover':
            role_signature_key = 'proverSignature'
        elif role == 'verifier':
            role_signature_key = 'verifierSignature'
        else:
            raise ValueError(f"Unknown role {role}")

        tx_template.inputs[index][role_signature_key] = serialize_hex(signature)

    # Make sure SQLAlchemy knows that the JSON object has changed
    flag_modified(tx_template, 'inputs')

    return True


if __name__ == "__main__":
    main()
