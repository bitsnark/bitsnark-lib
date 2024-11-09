import argparse
import itertools
import logging
from dataclasses import dataclass
from decimal import Decimal

import sqlalchemy as sa
from bitcointx.core import CTxIn, CTxOut, CMutableTransaction, COutPoint, CTxWitness, CTxInWitness
from bitcointx.core.key import XOnlyPubKey, CKey
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.core.script import CScript, TaprootScriptTree, OP_RETURN, CScriptWitness
from bitcointx.wallet import P2TRCoinAddress

from demo.bitcoin_rpc import BitcoinRPC
from ._base import (
    Command,
    Context,
    get_default_prover_privkey_hex,
    get_default_verifier_privkey_hex,
)
from ..core.models import TransactionTemplate
from ..core.parsing import parse_hex_bytes
from ..core.signing import sign_input
from ..scripteval import eval_tapscript

logger = logging.getLogger(__name__)


@dataclass
class Source:
    tx_template: TransactionTemplate
    output_index: int
    spending_condition_index: int


@dataclass
class TestCase:
    script: CScript
    witness_elems: list[bytes]
    sources: list[Source]

    def script_repr(self, *, limit: int = None, newlines: bool=False):
        ret = repr(self.script)
        ret = ret.removeprefix('CBitcoinScript([').removesuffix('], name=\'script\')').removesuffix('])')
        if limit is not None and len(ret) > limit:
            ret = ret[:limit] + "..."
        if newlines:
            ret = ret.replace(', ', '\n')
        else:
            ret = f'Script({ret})'
        return ret

    def sources_repr(self):
        return ', '.join(
            f"{s.tx_template.name}/{s.output_index}/{s.spending_condition_index}"
            for s in self.sources
        )

@dataclass
class Result:
    test_case: TestCase
    success: bool
    error: Exception | None = None
    reason: str | None = None
    spent_output: str | None = None  # txid:index
    spending_tx_id: str | None = None



class TestScriptsCommand(Command):
    """
    Test spending individual tap scripts
    """
    name = 'test_scripts'

    def init_parser(self, parser: argparse.ArgumentParser):
        parser.add_argument('--setup-id', default='test_setup',
                            help='Setup ID of the tx templates to test')
        parser.add_argument('--agent-id', default='bitsnark_prover_1',
                            help='Agent ID of the tx templates to test (only used for filtering)')
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
            agent_id=context.args.agent_id,
            setup_id=context.args.setup_id,
        )
        if filter_name:
            tx_template_query = tx_template_query.filter(TransactionTemplate.name == filter_name)
        tx_template_query = tx_template_query.order_by(TransactionTemplate.ordinal)
        tx_templates = dbsession.scalars(tx_template_query).all()

        test_cases_by_script: dict[str, TestCase] = {}

        logger.info("Getting scripts from %s tx templates", len(tx_templates))
        # tx_template, output_index, spending_condition
        for tx_template in tx_templates:
            for output_index, output in enumerate(tx_template.outputs):
                if filter_output_index is not None and output_index != filter_output_index:
                    continue
                for spending_condition in output['spendingConditions']:
                    if filter_spending_condition_index is not None and spending_condition['index'] != filter_spending_condition_index:
                        continue

                    if 'script' not in spending_condition:
                        logger.info(
                            'Skipping spending condition without script (%s/%s/%s)',
                            tx_template.name,
                            output_index,
                            spending_condition['index']
                        )
                        continue

                    if not context.args.enable_timelocks and 'timeoutBlocks' in spending_condition:
                        logger.info(
                            'Skipping timeoutBlocks spending condition (%s/%s/%s) because '
                            '--enable-timelocks is not set',
                            tx_template.name,
                            output_index,
                            spending_condition['index']
                        )
                        continue

                    example_witness = spending_condition.get('exampleWitness', [])
                    # if 'exampleWitness' not in spending_condition:
                    #     logger.info(
                    #         'Skipping spending condition without exampleWitness (%s/%s/%s)',
                    #         tx_template.name,
                    #         output_index,
                    #         spending_condition['index']
                    #     )
                    #     continue

                    witness_elems = [
                        parse_hex_bytes(s) for s in
                        # This flattens the list of lists
                        itertools.chain.from_iterable(example_witness)
                    ]
                    test_case = test_cases_by_script.setdefault(
                        spending_condition['script'],
                        TestCase(
                            script=CScript(parse_hex_bytes(spending_condition['script']), name='script'),
                            witness_elems=witness_elems,
                            sources=[],
                        )
                    )
                    test_case.sources.append(Source(
                        tx_template=tx_template,
                        output_index=output_index,
                        spending_condition_index=spending_condition['index'],
                    ))

        results = []
        for test_index, test_case in enumerate(test_cases_by_script.values(), start=1):
            logger.info(
                '[%s/%s] Testing %s, used by: %s',
                test_index,
                len(test_cases_by_script),
                test_case.script_repr(limit=50),
                test_case.sources_repr(),
            )
            if context.args.print_script:
                logger.info('Script:\n%s', test_case.script_repr(newlines=True))

            try:
                result = self.test(
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

    def test(
        self,
        *,
        bitcoin_rpc: BitcoinRPC,
        test_case: TestCase,
        change_address: str,
        prover_privkey: CKey,
        verifier_privkey: CKey,
        debug: bool = False,
        evaluate: bool = False,
        print_witness: bool = False,
    ) -> Result:
        # logger.info('Script: %s', test_case.script_repr())

        amount_sat = 100_000
        amount_btc = Decimal(amount_sat) / Decimal(10 ** 8)

        # internal_pubkey = XOnlyPubKey(CKey.fromhex('1337' * (64//4)).pub)  # Just some random key
        # This is used in TS code so it will do for now
        internal_pubkey = XOnlyPubKey.fromhex('0000000000000000000000000000000000000000000000000000000000000001')

        taptree = TaprootScriptTree(
            leaves=[test_case.script],
            internal_pubkey=internal_pubkey,
        )
        address = P2TRCoinAddress.from_script_tree(taptree)

        outputs = [
            {
                str(address): str(amount_btc),
            }
        ]

        funded_psbt_response = bitcoin_rpc.call(
            'walletcreatefundedpsbt',
            [],  # Inputs
            outputs,  # Outputs
            0,  # Locktime
            {
                'add_inputs': True,
                'changeAddress': change_address,
                'changePosition': 1,
                'fee_rate': 10,
            }
        )

        process_psbt_response = bitcoin_rpc.call(
            'walletprocesspsbt',
            funded_psbt_response['psbt'],
        )
        if not process_psbt_response['complete']:
            raise ValueError(f"PSBT not complete: {process_psbt_response}")
        signed_psbt = PartiallySignedTransaction.from_base64(process_psbt_response['psbt'])

        script_tx = signed_psbt.extract_transaction()
        serialized_script_tx = script_tx.serialize().hex()

        script_tx_id = bitcoin_rpc.call(
            'sendrawtransaction',
            serialized_script_tx,
        )
        bitcoin_rpc.mine_blocks()
        logger.info(f"Broadcast script transaction %s, attempting to spend it next", script_tx_id)

        # Spend the output
        spending_tx = CMutableTransaction(
            vin=[
                CTxIn(
                    COutPoint(
                        hash=bytes.fromhex(script_tx_id)[::-1],
                        n=0,
                    )
                )
            ],
            vout=[
                CTxOut(
                    nValue=0,
                    scriptPubKey=CScript([OP_RETURN, b'There must be some filler here or the TX will get rejected']),
                ),
            ],
            nVersion=2,
        )

        spent_script, control_block = taptree.get_script_with_control_block('script')
        assert spent_script == test_case.script

        # Get signatures
        spent_outputs = [
            CTxOut(
                nValue=amount_sat,
                scriptPubKey=address.to_scriptPubKey(),
            )
        ]
        prover_signature = sign_input(
            script=spent_script,
            tx=spending_tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=prover_privkey,
        )
        verifier_signature = sign_input(
            script=spent_script,
            tx=spending_tx,
            input_index=0,
            spent_outputs=spent_outputs,
            private_key=verifier_privkey,
        )
        full_witness_elems = [
            *test_case.witness_elems,
            verifier_signature,
            prover_signature,
        ]
        spending_tx.wit = CTxWitness(vtxinwit=[
            CTxInWitness(CScriptWitness(
                stack=[
                    *full_witness_elems,
                    spent_script,
                    control_block,
                ]
            ))
        ])

        serialized_spending_tx = spending_tx.serialize().hex()

        if print_witness:
            logger.info(
                'Witness elems:\n%s:',
                '\n'.join(f"{i:03d}: {elem.hex()}" for i, elem in enumerate(full_witness_elems))
            )
            logger.info("Control block: %s", control_block.hex())

        if evaluate:
            eval_tapscript(
                witness_elems=full_witness_elems,
                script=spent_script,
                ignore_signature_errors=True,
                debug=debug,
            )

        if debug:
            breakpoint()

        mempool_accept = bitcoin_rpc.call(
            'testmempoolaccept',
            [serialized_spending_tx],
        )
        if not mempool_accept[0]['allowed']:
            logger.info("Mempool rejection: %s", mempool_accept)
            return Result(
                test_case=test_case,
                success=False,
                reason=f'testmempoolaccept failed for spending tx: {mempool_accept[0]["reject-reason"]}',
            )

        tx_id = bitcoin_rpc.call(
            'sendrawtransaction',
            serialized_spending_tx,
        )
        logger.info("tx send successfully: %s", tx_id)
        bitcoin_rpc.mine_blocks()
        return Result(
            test_case=test_case,
            success=True,
        )
