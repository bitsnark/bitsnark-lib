import logging
import os
import subprocess
from bitsnark.constants import PROJECT_ROOT_DIR
from ..constants import (
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    POSTGRES_HOST,
    POSTGRES_PORT,
)


logger = logging.getLogger(__name__)


class NPMCommandRunner:
    def __init__(self):
        self.cwd = PROJECT_ROOT_DIR
        self.env = {
            'POSTGRES_USER': POSTGRES_USER,
            'POSTGRES_PASSWORD': POSTGRES_PASSWORD,
            'POSTGRES_HOST': POSTGRES_HOST,
            'POSTGRES_PORT': str(POSTGRES_PORT),
            # We need to make sure ts-node doesn't read these from .env even if it exists
            'PROVER_SCHNORR_PRIVATE': '415c69b837f4146019574f59c223054c8c144ac61b6ae87bc26824c0f8d034e2',
            'PROVER_SCHNORR_PUBLIC': 'ae2ea39bca4b6b14567e3c38b9680f6483ceeef4ae17f8dceb5a5a0866999b75',
            'VERIFIER_SCHNORR_PRIVATE': 'd4067af1132afcb352b0edef53d8aa2a5fc713df61dee31b1d937e69ece0ebf0',
            'VERIFIER_SCHNORR_PUBLIC': '86ad52a51b65ab3aed9a64e7202a7aa1f2bd3da7a6a2dae0f5c8e28bda29de79',
        }

    def run(self, command: str, *args: str) -> str:
        try:
            ret = subprocess.check_output(
                ['npm', 'run', command, *args],
                cwd=self.cwd,
                env={
                    **os.environ,
                    **self.env,
                },
                text=True,
            )
        except subprocess.CalledProcessError as e:
            logger.error("Failed to run npm command %s %s: %s", command, args, e.output)
            raise
        logger.debug("Ran npm command %s %s: %s", command, args, ret)
        return ret
