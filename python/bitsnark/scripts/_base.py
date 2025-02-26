import json
import logging
import sys
from contextlib import redirect_stdout
from typing import (
    Any,
    Callable,
)

logger = logging.getLogger(__name__)


def run_py_client_script(func: Callable[[Any], Any]) -> None:
    """
    Run a python function in a way that can be called from py-client.ts
    """
    try:
        input_data = json.load(sys.stdin)
        with redirect_stdout(sys.stderr):
            result = func(input_data)
    except Exception as e:
        logger.exception("py-client script error")
        result = {"error": str(e), "errorType": type(e).__name__}
    else:
        result = {"result": result}
    result_json = json.dumps(result)
    print(result_json)
