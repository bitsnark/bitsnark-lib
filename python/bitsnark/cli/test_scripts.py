import argparse
import logging

import sqlalchemy as sa
from bitcointx.core.key import CKey

from ._base import (
    Command,
    Context,
    get_default_prover_privkey_hex,
    get_default_verifier_privkey_hex,
)
from ..core.models import TransactionTemplate
from ..core.script_testing import TestCase, Result, execute_script_test_case, collect_script_test_cases

logger = logging.getLogger(__name__)


class TestScriptsCommand(Command):
    """
    Test spending individual tap scripts
    """
    name = 'test_scripts'

    def init_parser(self, parser: argparse.ArgumentParser):
        parser.add_argument('--setup-id', default='test_setup',
                            help='Setup ID of the tx templates to test')
        parser.add_argument('--role',
                            type=lambda x: x.upper(),
                            default='PROVER',
                            choices=['PROVER', 'VERIFIER', 'prover', 'verifier'],
                            help='Role to test (PROVER or VERIFIER)')
        parser.add_argument('--agent-id',
                            default='bitsnark_prover_1',
                            help=(
                                'Agent ID of the tx templates to test (used for database and filtering). '
                            ))
        parser.add_argument('--filter',
                            help='template_name/output_index/spending_condition_index')
        parser.add_argument('--prover-privkey',
                            help='Prover schnorr private key as hex for signing',
                            default=get_default_prover_privkey_hex())
        parser.add_argument('--verifier-privkey',
                            help='Verifier schnorr private key as hex for signing',
                            default=get_default_verifier_privkey_hex())

        parser.add_argument('--debug', help='Drop into Python debugger before testing mempoolaccept',
                            action='store_true')
        parser.add_argument('--print-script', help='Print each script', action='store_true')
        parser.add_argument('--print-witness',
                            help='Print the witness elements for each tx',
                            action='store_true')
        parser.add_argument('--enable-timelocks', help='Enable testing of timelock transactions',
                            action='store_true')
        parser.add_argument('--eval', help='Evaluate script before submitting',
                            action='store_true')

    def run(
        self,
        context: Context,
    ) -> list[Result]:
        dbsession = context.dbsession
        bitcoin_rpc = context.bitcoin_rpc

        setup_id = context.args.setup_id
        agent_id = context.args.agent_id or f'bitsnark_{context.args.role.lower()}_1'
        logger.info(
            "Testing scripts. role: %s, setup_id: %s, agent_id: %s",
            context.args.role,
            setup_id,
            agent_id,
        )

        prover_privkey = CKey.fromhex(context.args.prover_privkey)
        verifier_privkey = CKey.fromhex(context.args.verifier_privkey)

        change_address = bitcoin_rpc.call('getnewaddress')
        filter_parts = [] if not context.args.filter else context.args.filter.split('/')
        filter_name = filter_parts[0] if len(filter_parts) > 0 else None
        filter_output_index = int(filter_parts[1]) if len(filter_parts) > 1 else None
        filter_spending_condition_index = int(filter_parts[2]) if len(filter_parts) > 2 else None
        if filter_parts:
            logger.info("Filtering to tx_template: %s, output_index: %s, spending_condition_index: %s",
                        filter_name, filter_output_index, filter_spending_condition_index)

        logger.info('Mining 101 blocks to %s to ensure we have enough funds', change_address)
        bitcoin_rpc.mine_blocks(101, change_address)

        tx_template_query = sa.select(TransactionTemplate).filter_by(
            setup_id=setup_id,
        )
        if filter_name:
            tx_template_query = tx_template_query.filter(TransactionTemplate.name == filter_name)
        tx_template_query = tx_template_query.order_by(TransactionTemplate.ordinal)
        tx_templates = dbsession.scalars(tx_template_query).all()

        logger.info("Getting scripts from %s tx templates", len(tx_templates))
        test_cases = collect_script_test_cases(
            tx_templates=tx_templates,
            role=context.args.role,
            filter_output_index=filter_output_index,
            filter_spending_condition_index=filter_spending_condition_index,
            enable_timelocks=context.args.enable_timelocks,
        )

        results = []
        for test_index, test_case in enumerate(test_cases, start=1):
            logger.info(
                '[%s/%s] Testing %s, used by: %s',
                test_index,
                len(test_cases),
                test_case.script_repr(limit=50),
                test_case.sources_repr(),
            )
            if context.args.print_script:
                logger.info('Script:\n%s', test_case.script_repr(newlines=True))

            try:
                result = execute_script_test_case(
                    test_case=test_case,
                    bitcoin_rpc=bitcoin_rpc,
                    change_address=change_address,
                    debug=context.args.debug,
                    prover_privkey=prover_privkey,
                    verifier_privkey=verifier_privkey,
                    evaluate=context.args.eval,
                    print_witness=context.args.print_witness,
                )
            except Exception as e:
                logger.exception(e)
                result = Result(
                    test_case=test_case,
                    success=False,
                    error=e,
                    reason='An exception occured',
                )

            results.append(result)

        num_success = len([r for r in results if r.success])
        num_fail = len([r for r in results if not r.success])
        for result in results:
            status = 'OK' if result.success else 'FAIL'
            error_repr = f'error: {str(result.error)[:100]} ' if result.error else ''
            reason_repr = f'reason: {result.reason} ' if result.reason else ''

            logger.info(
                "[%s] %s\tsources: %s\t%s%s",
                status,
                result.test_case.script_repr(limit=50),
                result.test_case.sources_repr(),
                error_repr,
                reason_repr,
            )
        logger.info("Total:\t%s OK\t%s FAIL", num_success, num_fail)
        return results
