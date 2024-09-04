import contextlib
from bitcointx.core import script, scripteval, CTransaction
from bitcointx.core.script import CScriptWitness


def eval_tapscript(
    *,
    witness_elems: list[bytes],
    script: script.CScript,
):
    # scripteval.VerifyWitnessProgram(
    #     witness=CScriptWitness(witness_elems),
    #     program=script,
    #     txTo=CTransaction(),
    #     inIdx=0,
    #     witversion=1,
    # )
    with monkeypatch_bitcointx_limits(
        max_script_size=1_000_000,
        max_script_opcodes=1_000_000,
    ):
        scripteval.EvalScript(
            stack=[*witness_elems],
            scriptIn=script,
            inIdx=0,
            txTo=CTransaction(),
        )


@contextlib.contextmanager
def monkeypatch_bitcointx_limits(
    *,
    max_script_size: int,
    max_script_opcodes: int,
):
    old_max_script_size = script.MAX_SCRIPT_SIZE
    old_max_script_opcodes = script.MAX_SCRIPT_OPCODES
    try:
        script.MAX_SCRIPT_SIZE = max_script_size
        scripteval.MAX_SCRIPT_SIZE = max_script_size
        script.MAX_SCRIPT_OPCODES = max_script_opcodes
        scripteval.MAX_SCRIPT_OPCODES = max_script_opcodes
        yield
    finally:
        script.MAX_SCRIPT_SIZE = old_max_script_size
        scripteval.MAX_SCRIPT_SIZE = old_max_script_size
        script.MAX_SCRIPT_OPCODES = old_max_script_opcodes
        scripteval.MAX_SCRIPT_OPCODES = old_max_script_opcodes
