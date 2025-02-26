import logging
import pytest
import sqlalchemy as sa

from bitcointx.core.key import CKey
from bitsnark.btc.rpc import BitcoinRPC
from tests.utils.bitcoin_wallet import BitcoinWallet
from tests.utils.npm import NPMCommandRunner
from bitsnark.core.models import TransactionTemplate
from bitsnark.core.script_testing import (
    collect_script_test_cases,
    execute_script_test_case,
    Result,
)

pytestmark = pytest.mark.usefixtures("docker_compose")
logger = logging.getLogger(__name__)


PROVER_AGENT_ID = "bitsnark_prover_1"
VERIFIER_AGENT_ID = "bitsnark_verifier_1"

PROVER_PRIVKEY = CKey.fromhex(
    "415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2"
)
VERIFIER_PRIVKEY = CKey.fromhex(
    "d4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0"
)


def test_transaction_template_scripts(
    dbsession_prover: sa.orm.Session,
    dbsession_verifier: sa.orm.Session,
    btc_rpc: BitcoinRPC,
    btc_wallet: BitcoinWallet,
    npm: NPMCommandRunner,
):
    logger.info("Running emulate-setup")
    npm.run("emulate-setup")

    with dbsession_prover.begin(), dbsession_verifier.begin():
        prover_test_cases = collect_script_test_cases(
            tx_templates=dbsession_prover.scalars(sa.select(TransactionTemplate)).all(),
            role="PROVER",
        )
        assert len(prover_test_cases) > 0, "No prover test cases found"

        verifier_test_cases = collect_script_test_cases(
            tx_templates=dbsession_verifier.scalars(
                sa.select(TransactionTemplate)
            ).all(),
            role="VERIFIER",
        )
        assert len(verifier_test_cases) > 0, "No verifier test cases found"

        change_address = btc_wallet.get_receiving_address()
        logger.info(
            "Mining 101 blocks to %s to ensure we have enough funds", change_address
        )
        btc_wallet.mine(101, change_address)

        all_test_cases = prover_test_cases + verifier_test_cases

        results = []
        for i, test_case in enumerate(all_test_cases, start=1):
            logger.info("Testing %s/%s: %s", i, len(all_test_cases), test_case)
            try:
                result = execute_script_test_case(
                    test_case=test_case,
                    bitcoin_rpc=btc_rpc,
                    change_address=change_address,
                    prover_privkey=PROVER_PRIVKEY,
                    verifier_privkey=VERIFIER_PRIVKEY,
                )
            except Exception as e:
                logger.exception(e)
                result = Result(
                    test_case=test_case,
                    success=False,
                    error=e,
                    reason="An exception occured",
                )
            if result.success:
                logger.info("Success")
            else:
                logger.error("Failed: %s", result.reason)
            results.append(result)

        successes = [r for r in results if r.success]
        failures = [r for r in results if not r.success]
        logger.info("Successes: %s, Failures: %s", len(successes), len(failures))

        assert not failures, "The following script test cases failed: {}".format(
            ", ".join(str(t) for t in failures)
        )
