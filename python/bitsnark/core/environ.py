import warnings
import logging

from ..constants import PROJECT_ROOT_DIR

__all__ = [
    "load_bitsnark_dotenv",
]


DOTENV_FILE = PROJECT_ROOT_DIR / ".env"
logger = logging.getLogger(__name__)


def load_bitsnark_dotenv():
    from dotenv import load_dotenv

    if not DOTENV_FILE.exists():
        warnings.warn(f"{DOTENV_FILE} does not exist")
        return

    logger.info(f"Loading environment variables from {DOTENV_FILE}")
    load_dotenv(dotenv_path=str(DOTENV_FILE))
