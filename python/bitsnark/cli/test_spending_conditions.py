import argparse
import logging
from dataclasses import dataclass

import sqlalchemy as sa

from ._base import (
    Command,
    Context,
    get_default_prover_privkey_hex,
    get_default_verifier_privkey_hex,
)
from .fund_and_send import FundAndSendCommand
from .spend import SpendCommand
from ..core.models import TransactionTemplate, SpendingConditionJson

logger = logging.getLogger(__name__)


@dataclass
class Result:
    tx_template: TransactionTemplate
    output_index: int
    spending_condition_index: int
    error: Exception | None


class TestSpendingConditionsCommand(Command):
    """
    Spend an output according to spending condition
    """
    name = 'test_spending_conditions'

    def init_parser(self, parser: argparse.ArgumentParser):
        parser.add_argument('--setup-id', default='test_setup',
                            help='Setup ID of the tx templates to test')
        parser.add_argument('--agent-id', default='bitsnark_prover_1',
                            help='Agent ID of the tx templates to test (only used for filtering)')
        parser.add_argument('--names',
                            help='Comma-separated list of tx template names. If omitted, test everything')
        parser.add_argument('--prover-privkey',
                            help='Prover schnorr private key as hex for signing',
                            default=get_default_prover_privkey_hex())
        parser.add_argument('--verifier-privkey',
                            help='Verifier schnorr private key as hex for signing',
                            default=get_default_verifier_privkey_hex())

    def run(
        self,
        context: Context,
    ) -> list[Result]:
        dbsession = context.dbsession
        bitcoin_rpc = context.bitcoin_rpc
        change_address = bitcoin_rpc.call('getnewaddress')

        logger.info('Mining 101 blocks to %s to ensure we have enough funds', change_address)
        bitcoin_rpc.mine_blocks(101, change_address)

        tx_template_query = sa.select(TransactionTemplate).filter_by(
            agent_id=context.args.agent_id,
            setup_id=context.args.setup_id,
        )
        if context.args.names:
            names = context.args.names.split(',')
            logger.info("Limiting to tx_templates: %s", names)
            tx_template_query = tx_template_query.filter(TransactionTemplate.name.in_(names))
        tx_template_query = tx_template_query.order_by(TransactionTemplate.ordinal)
        tx_templates = dbsession.scalars(tx_template_query).all()

        logger.info("Getting spending conditions from %s tx templates", len(tx_templates))
        # tx_template, output_index, spending_condition
        to_test: list[tuple[TransactionTemplate, int, SpendingConditionJson]] = []
        for tx_template in tx_templates:
            for output_index, output in enumerate(tx_template.outputs):
                for spending_condition in output['spendingConditions']:
                    if 'timeoutBlocks' in spending_condition:
                        logger.info(
                            'Skipping timeoutBlocks spending condition (%s/%s/%s)',
                            tx_template.name,
                            output_index,
                            spending_condition['index']
                        )
                        continue

                    if 'exampleWitness' not in spending_condition:
                        logger.info(
                            'Skipping spending condition without exampleWitness (%s/%s/%s)',
                            tx_template.name,
                            output_index,
                            spending_condition['index']
                        )
                        continue

                    logger.info(
                        'Adding spending condition to tests: %s/%s/%s',
                        tx_template.name,
                        output_index,
                        spending_condition['index']
                    )
                    to_test.append((tx_template, output_index, spending_condition))

        results = []
        for test_index, (tx_template, output_index, spending_condition) in enumerate(to_test, start=1):
            logger.info(
                '[%s/%s] Testing #%s: %s (%s), output #%s spending condition #%s',
                test_index,
                len(to_test),
                tx_template.ordinal,
                tx_template.name,
                tx_template.role,
                output_index,
                spending_condition['index']
            )

            tx_id = FundAndSendCommand().run(Context(
                dbsession=dbsession,
                bitcoin_rpc=bitcoin_rpc,
                args=argparse.Namespace(
                    setup_id=tx_template.setup_id,
                    agent_id=tx_template.agent_id,
                    name=tx_template.name,
                    change_address=change_address,
                    fee_rate=10,
                    output_amount=100_000,
                ),
            ))
            logger.info("Sent funded tx: %s", tx_id)

            result = Result(
                tx_template=tx_template,
                output_index=output_index,
                spending_condition_index=spending_condition['index'],
                error=None,
            )
            try:
                SpendCommand().run(Context(
                    dbsession=dbsession,
                    bitcoin_rpc=bitcoin_rpc,
                    args=argparse.Namespace(
                        setup_id=tx_template.setup_id,
                        agent_id=tx_template.agent_id,
                        name=tx_template.name,
                        spending_condition=spending_condition['index'],
                        prevout=f"{tx_id}:{output_index}",
                        prover_privkey=context.args.prover_privkey,
                        verifier_privkey=context.args.verifier_privkey,
                        to_address='OP_RETURN',
                        amount=0,
                    ),
                ))
            except Exception as e:
                result.error = e
                logger.info("ERROR! %s", e)
            else:
                logger.info("Success!")
            results.append(result)

        num_success = len([r for r in results if r.error is None])
        num_fail = len([r for r in results if r.error is not None])
        for result in results:
            if result.error:
                logger.info(
                    "[FAIL]\ttx %s\toutput %s\tspendingCondition %s\terror: %s",
                    result.tx_template.name,
                    result.output_index,
                    result.spending_condition_index,
                    result.error
                )
            else:
                logger.info(
                    "[OK]\ttx %s\toutput %s\tspendingCondition %s",
                    result.tx_template.name,
                    result.output_index,
                    result.spending_condition_index,
                )
        logger.info("Total:\t%s OK\t%s FAIL", num_success, num_fail)
        return results