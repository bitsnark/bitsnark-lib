import logging
import os
import subprocess
from bitsnark.constants import PROJECT_ROOT_DIR
from ..constants import NODE_ENV


logger = logging.getLogger(__name__)


class NPMCommandRunner:
    def __init__(self):
        self.cwd = PROJECT_ROOT_DIR

    def run(self, command: str, *args: str) -> str:
        try:
            ret = subprocess.check_output(
                ['npm', 'run', command, *args],
                cwd=self.cwd,
                env={
                    **os.environ,
                    **NODE_ENV,
                },
                text=True,
            )
        except subprocess.CalledProcessError as e:
            logger.error("Failed to run npm command %s %s: %s", command, args, e.output)
            raise
        logger.debug("Ran npm command %s %s: %s", command, args, ret)
        return ret
