import argparse
import logging

from bitcointx.core.script import CScript, OP_DUP, OP_DROP, OP_3DUP, OP_2DUP, OP_2DROP

from bitsnark.core.parsing import parse_hex_bytes
from ._base import Command, add_tx_template_args, find_tx_template, Context

logger = logging.getLogger(__name__)


class CalculateScriptOptimizationsCommand(Command):
    name = "calculate_script_optimizations"

    def init_parser(self, parser: argparse.ArgumentParser):
        add_tx_template_args(parser)

    def run(
        self,
        context: Context,
    ):
        tx_template = find_tx_template(context)

        logger.info("Optimizing scripts for transaction template %s", tx_template.name)
        for output_index, output in enumerate(tx_template.outputs):
            for spending_condition_index, spending_condition in enumerate(
                output["spendingConditions"]
            ):
                script_raw = spending_condition.get("script")
                if script_raw is None:
                    logger.warning(
                        "Output %s spending condition %s has no script -- skipping",
                        output_index,
                        spending_condition_index,
                    )
                    continue

                logger.info(
                    "Optimizing output %s spending condition %s",
                    output_index,
                    spending_condition_index,
                )
                original_script = CScript(parse_hex_bytes(script_raw))
                logger.info("\tOriginal script size: %s", len(original_script))
                theoretically_optimal_script = get_theoretically_optimal_script(
                    original_script
                )
                logger.info(
                    "\tTheoretically optimal script size (not reasonable): %s",
                    len(theoretically_optimal_script),
                )
                logger.info(
                    "\t\tSavings: %s %%",
                    100
                    - len(theoretically_optimal_script) / len(original_script) * 100,
                )
                optimized_script = optimize_script(original_script)
                logger.info("\tOptimized script size: %s", len(optimized_script))
                logger.info(
                    "\t\tSavings: %s %%",
                    100 - len(optimized_script) / len(original_script) * 100,
                )


def optimize_script(script: CScript) -> CScript:
    """
    Optimize a script by replacing successive OP_DUPs and OP_DROPs with OP_3DUP/OP_2DUP/OP_2DROP
    """
    if len(script) < 2:
        return script
    iterator = iter(script)
    stack = [next(iterator)]
    logger.debug("+ %s", stack[-1])
    for current_op in iterator:
        prev_op = stack[-1]
        ops = (prev_op, current_op)
        removed = None
        if ops == (OP_2DUP, OP_DUP):
            removed = stack.pop()
            added = OP_3DUP
        elif ops == (OP_DUP, OP_DUP):
            removed = stack.pop()
            added = OP_2DUP
        elif ops == (OP_DROP, OP_DROP):
            removed = stack.pop()
            added = OP_2DROP
        else:
            added = current_op

        stack.append(added)
        if removed is not None:
            logger.debug("- %s", removed)
        logger.debug("+ %s", added)

    return CScript(stack)


def get_theoretically_optimal_script(script: CScript) -> CScript:
    # Just replace all OP_DUPs and OP_DROPs to see how much we even could save with the naive optimization
    return CScript(op for op in script if op not in (OP_DUP, OP_DROP))
