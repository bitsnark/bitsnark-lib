import functools
import json
import logging
import os
import pathlib
import subprocess
import time
from contextlib import contextmanager
from types import SimpleNamespace

logger = logging.getLogger(__name__)

COMPOSE_VERBOSE = os.environ.get("COMPOSE_VERBOSE", "").lower() in ("1", "true")
BASE_DIR = pathlib.Path(__file__).parent.parent.parent  # just use the root python dir for now
COMPOSE_COMMAND = ["docker", "compose"]
COMPOSE_FILE = BASE_DIR / "docker-compose.yaml"
ENV_FILE = BASE_DIR / "env.test"
MAX_WAIT_TIME_S = 120
COMPOSE_BASE_ARGS = (*COMPOSE_COMMAND, "-f", str(COMPOSE_FILE), "--env-file", str(ENV_FILE))

assert ENV_FILE.exists(), f"Missing {ENV_FILE}"


def run_docker_compose_command(
    *args,
    check: bool = True,
    capture: bool = False,
    quiet: bool = not COMPOSE_VERBOSE,
    timeout: float | None = None,
    **extra_kwargs,
) -> subprocess.CompletedProcess:
    extra_kwargs["check"] = check
    extra_kwargs["timeout"] = timeout
    extra_kwargs["capture_output"] = capture

    if quiet and not capture:
        extra_kwargs["stdout"] = subprocess.DEVNULL
        extra_kwargs["stderr"] = subprocess.DEVNULL

    try:
        return subprocess.run(
            COMPOSE_BASE_ARGS + args,
            cwd=BASE_DIR,
            **extra_kwargs,
        )
    except subprocess.CalledProcessError as e:
        logger.error(
            "Docker compose exception %s, stdout: %s, stderr: %s",
            e,
            e.stdout,
            e.stderr,
        )
        raise


def compose_popen(*args, **kwargs) -> subprocess.Popen:
    return subprocess.Popen(
        COMPOSE_BASE_ARGS + args,
        cwd=BASE_DIR,
        **kwargs,
    )

def is_service_running(service: str):
    """
    Checks if the service is running.
    If the service has a healthcheck, it needs to report healthy.
    """
    info = get_container_info(service)

    if info is None:
        return False

    return info.State == "running" and info.Health in ["healthy", ""]


def get_container_info(service: str):
    output = run_docker_compose_command(
        "ps", "-a", "--format", "json", service, capture=True
    ).stdout.decode("utf-8").strip()

    if not output:
        return None

    return json.loads(output, object_hook=lambda d: SimpleNamespace(**d))


def start_docker_compose():
    services = ["bitcoind", "postgres"]
    run_docker_compose_command("up", "-d", "--build")
    for _ in range(20):
        if all(is_service_running(service) for service in services):
            break
        time.sleep(1)
    else:
        raise TimeoutError("a service did not start in time")



def stop_docker_compose():
    run_docker_compose_command("down", "--volumes")


@contextmanager
def start_stop_docker_compose():
    start_docker_compose()
    try:
        yield
    finally:
        stop_docker_compose()
