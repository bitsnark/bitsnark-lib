"""Re-usable code for testing scripts of tx templates"""
import itertools
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Literal

from bitcointx.core import CTxIn, CTxOut, CMutableTransaction, COutPoint, CTxWitness, CTxInWitness
from bitcointx.core.key import XOnlyPubKey, CKey
from bitcointx.core.psbt import PartiallySignedTransaction
from bitcointx.core.script import CScript, TaprootScriptTree, OP_RETURN, CScriptWitness
from bitcointx.wallet import P2TRCoinAddress

from ..btc.rpc import BitcoinRPC
from ..core.models import TransactionTemplate
from ..core.parsing import parse_hex_bytes, parse_witness_element
from ..core.signing import sign_input
from ..scripteval import eval_tapscript

logger = logging.getLogger(__name__)


@dataclass
class TestCase:
    script: CScript
    role: Literal['PROVER', 'VERIFIER']
    witness_elems: list[bytes]
    tx_template: TransactionTemplate
    output_index: int
    spending_condition_index: int

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
        return f"{self.tx_template.name}/{self.output_index}/{self.spending_condition_index}"

    def __repr__(self):
        return (
            f"<TestCase(tx_template={self.tx_template.name}, output={self.output_index}, '"
            f"spending_condition={self.spending_condition_index}, role={self.role})>"
        )



@dataclass
class Result:
    test_case: TestCase
    success: bool
    error: Exception | None = None
    reason: str | None = None
    spent_output: str | None = None  # txid:index
    spending_txid: str | None = None


def collect_script_test_cases(
    *,
    tx_templates: Iterable[TransactionTemplate],
    role: Literal['PROVER', 'VERIFIER'],
    filter_name: str = None,
    filter_output_index: int = None,
    filter_spending_condition_index: int = None,
    enable_timelocks: bool = False,
) -> list[TestCase]:
    if role not in ('PROVER', 'VERIFIER'):
        raise ValueError(f"Invalid role: {role}")

    test_cases: list[TestCase] = []
    for tx_template in tx_templates:
        if filter_name is not None and tx_template.name != filter_name:
            continue

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

                if not enable_timelocks and 'timeoutBlocks' in spending_condition:
                    logger.info(
                        'Skipping timeoutBlocks spending condition (%s/%s/%s) because '
                        '--enable-timelocks is not set',
                        tx_template.name,
                        output_index,
                        spending_condition['index']
                    )
                    continue

                spending_condition_role = spending_condition.get('nextRole')
                if spending_condition_role != role:
                    logger.info(
                        'Skipping spending condition with nextRole=%s (%s/%s/%s) -- only looking for role %s',
                        role,
                        tx_template.name,
                        output_index,
                        spending_condition['index'],
                        role,
                    )
                    continue

                example_witness = spending_condition.get('exampleWitness', [])
                if 'exampleWitness' not in spending_condition:
                    logger.info(
                    'Skipping spending condition without exampleWitness (%s/%s/%s)',
                    tx_template.name,
                        output_index,
                        spending_condition['index']
                    )
                    continue

                witness_elems = []
                for raw in itertools.chain.from_iterable(example_witness):
                    elem = parse_witness_element(raw)
                    # convert single-byte elements to ints so that they get encoded properly
                    if isinstance(elem, bytes) and len(elem) == 1:
                        elem = int.from_bytes(elem, 'little')
                    witness_elems.append(elem)

                test_case = TestCase(
                    script=CScript(parse_hex_bytes(spending_condition['script']), name='script'),
                    role=spending_condition_role,
                    witness_elems=witness_elems,
                    tx_template=tx_template,
                    output_index=output_index,
                    spending_condition_index=spending_condition['index'],
                )
                test_cases.append(test_case)

    return test_cases


def execute_script_test_case(
    *,
    bitcoin_rpc: BitcoinRPC,
    test_case: TestCase,
    change_address: str,
    prover_privkey: CKey,
    verifier_privkey: CKey,
    debug: bool = False,
    evaluate: bool = False,
    print_witness: bool = False,
    internal_pubkey: XOnlyPubKey = XOnlyPubKey.fromhex('0000000000000000000000000000000000000000000000000000000000000001'),
    amount_sat: int = 100_000,
) -> Result:
    # logger.info('Script: %s', test_case.script_repr())

    amount_btc = Decimal(amount_sat) / Decimal(10 ** 8)

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

    script_txid = bitcoin_rpc.call(
        'sendrawtransaction',
        serialized_script_tx,
    )
    bitcoin_rpc.mine_blocks()
    logger.info(f"Broadcast script transaction %s, attempting to spend it next", script_txid)

    timeout_blocks = test_case.tx_template.outputs[
        test_case.output_index
    ]['spendingConditions'][
        test_case.spending_condition_index
    ].get('timeoutBlocks')
    if timeout_blocks:
        logger.info("Mining %d blocks to test timeout", timeout_blocks)
        bitcoin_rpc.mine_blocks(timeout_blocks)

    # Spend the output
    spending_tx = CMutableTransaction(
        vin=[
            CTxIn(
                COutPoint(
                    hash=bytes.fromhex(script_txid)[::-1],
                    n=0,
                ), nSequence=(timeout_blocks or 0xffffffff)
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

    new_array = [
        buf[0] if isinstance(buf, (bytes, bytearray)) and len(buf) == 1 else buf
        for buf in test_case.witness_elems
    ]

    full_witness_elems = [
        *new_array,
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
            reason=f'testmempoolaccept: {mempool_accept[0]["reject-reason"]}',
        )

    txid = bitcoin_rpc.call(
        'sendrawtransaction',
        serialized_spending_tx,
    )
    logger.info("tx send successfully: %s", txid)
    bitcoin_rpc.mine_blocks()
    return Result(
        test_case=test_case,
        success=True,
    )
