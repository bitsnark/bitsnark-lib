import argparse
import logging

import sqlalchemy as sa
from bitcointx.core.key import XOnlyPubKey

from ._base import (
    Command,
    Context,
)
from ..core.models import TransactionTemplate
from ..core.parsing import parse_hex_bytes
from ..core.transactions import construct_signable_transaction, MissingScript

logger = logging.getLogger(__name__)


def verify_setup_signatures(*, dbsession, setup_id, signer_role, signer_pubkey, ignore_missing_script, name=None):
    'Verify all the signatures of a setup.'
    signature_key = f"{signer_role.lower()}Signature"

    query = sa.select(TransactionTemplate).filter_by(
        setup_id=setup_id,
    ).filter(
        ~TransactionTemplate.is_external
    ).order_by(
        TransactionTemplate.ordinal
    )
    if name:
        logger.info("Verifying %s for tx template %s", f"{signature_key}s", name)
        query = query.filter_by(name=name)
    else:
        logger.info("Verifying all %s", f"{signature_key}s")

    tx_templates = dbsession.scalars(query).all()
    if len(tx_templates) == 0:
        raise ValueError('No tx templates found')

    for tx_template in tx_templates:
        try:
            signable_tx = construct_signable_transaction(
                tx_template=tx_template,
                dbsession=dbsession,
            )
        except MissingScript:
            if ignore_missing_script:
                logger.warning("Skipping %s for %s because of missing script", signature_key, tx_template.name)
                continue
            raise

        assert len(tx_template.inputs) == len(signable_tx.tx.vin)
        assert len(tx_template.inputs) >= 1
        for input_index, inp in enumerate(tx_template.inputs):
            signature_raw = inp.get(signature_key)
            if not signature_raw:
                raise ValueError(f"Transaction {tx_template.name} input #{input_index} has no {signature_key}")

            signature = parse_hex_bytes(signature_raw)
            signable_tx.verify_input_signature_at(
                index=input_index,
                public_key=signer_pubkey,
                signature=signature
            )
            logger.info("%s for %s input %d is valid", signature_key, tx_template.name, input_index)

    logger.info("All %s valid", f"{signature_key}s")


class VerifySignaturesCommand(Command):
    name = 'verify_signatures'

    def init_parser(self, parser: argparse.ArgumentParser):
        parser.add_argument('--setup-id', default='test_setup',
                            help='Setup ID of the tx templates to test')
        parser.add_argument('--agent-id',
                            help=(
                                'Agent ID of the tx templates to test (used for database and filtering). '
                            ))
        parser.add_argument('--name',
                            required=False,
                            help=(
                                'Tx template name, optional'
                            ))
        parser.add_argument('--signer-role',
                            required=True,
                            choices=['prover', 'verifier', 'PROVER', 'VERIFIER'],
                            help='Which signature to check, prover or verifier')
        parser.add_argument('--signer-pubkey',
                            required=True,
                            help='Public key to use for signature verification (hex format)')
        parser.add_argument('--ignore-missing-script', action='store_true',
                            help='Ignore missing script errors')

    def run(
        self,
        context: Context,
    ):
        public_key = XOnlyPubKey.fromhex(context.args.signer_pubkey)

        dbsession = context.dbsession
        verify_setup_signatures(
            dbsession=dbsession,
            setup_id=context.args.setup_id,
            signer_role=context.args.signer_role,
            signer_pubkey=public_key,
            ignore_missing_script=context.args.ignore_missing_script,
            name=context.args.name
        )
