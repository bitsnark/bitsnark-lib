# Copyright (C) 2012-2017 The python-bitcoinlib developers
# Copyright (C) 2018 The python-bitcointx developers
#
# This file is part of python-bitcointx.
#
# It is subject to the license terms in the LICENSE file found in the top-level
# directory of this distribution.
#
# No part of python-bitcointx, including this file, may be copied, modified,
# propagated, or distributed except according to the terms contained in the
# LICENSE file.

# pylama:ignore=E501,C901

"""Tapscript evaluation

Forked from bitcointx.core.scripteval. See LICENSE in python-bitcointx for the license (LGPL)

As warned in the original module:
Be warned that there are highly likely to be consensus bugs in this code; it is
unlikely to match Satoshi Bitcoin exactly. Think carefully before using this
module.
"""

import hashlib
import logging
from typing import (
    List, Set
)

import bitcointx.core
import bitcointx.core._bignum
import bitcointx.core._ripemd160
import bitcointx.core.key
import bitcointx.core.serialize
from bitcointx.core.script import (
    CScript, SIGVERSION_BASE, SIGVERSION_WITNESS_V0,
    MAX_SCRIPT_ELEMENT_SIZE, FindAndDelete, DISABLED_OPCODES,
    SIGVERSION_Type, OP_CHECKMULTISIGVERIFY, OP_CHECKMULTISIG, OP_CHECKSIG, OP_CHECKSIGVERIFY,
    OP_1NEGATE, OP_EQUAL, OP_EQUALVERIFY,
    OP_PUSHDATA4,
    OP_1, OP_16,
    OP_IF, OP_ENDIF, OP_ELSE, OP_DROP, OP_DUP, OP_2DROP, OP_2DUP, OP_2OVER,
    OP_2ROT, OP_2SWAP, OP_3DUP, OP_CODESEPARATOR, OP_DEPTH,
    OP_FROMALTSTACK, OP_HASH160, OP_HASH256, OP_NOTIF, OP_IFDUP, OP_NIP,
    OP_NOP, OP_NOP1, OP_NOP10, OP_OVER, OP_PICK, OP_ROLL, OP_RETURN,
    OP_RIPEMD160, OP_ROT, OP_SIZE, OP_SHA1, OP_SHA256, OP_SWAP, OP_TOALTSTACK,
    OP_TUCK, OP_VERIFY, OP_WITHIN,
    SIGVERSION_TAPSCRIPT,
)
from bitcointx.core.scripteval import (
    EvalScriptError,
    MissingOpArgumentsError,
    VerifyScriptError,
    VerifyOpFailedError,
    SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS,
    MAX_STACK_ITEMS,
    # don't care if these are not in bitcointx.core.scripteval.__all__
    ScriptVerifyFlag_Type,  # noqa
    _CheckExec,  # noqa
    ScriptEvalState,  # noqa
    _opcode_name,  # noqa
    _ISA_BINOP,  # noqa
    _BinOp,  # noqa
    _ISA_UNOP,  # noqa
    _UnaryOp,  # noqa
    _CheckMultiSig,  # noqa
    _CheckSig,  # noqa
    SCRIPT_VERIFY_NULLFAIL,  # noqa
    SCRIPT_VERIFY_MINIMALIF,  # noqa
    _CastToBigNum,  # noqa
    _CastToBool,  # noqa
)

logger = logging.getLogger(__name__)


__all__ = (
    'eval_tapscript',
)

def eval_tapscript(
    *,
    witness_elems: List[bytes],
    script: CScript,
    debug: bool = False,
    ignore_signature_errors: bool = False,
    verify_stack: bool = True,
    # The rest of these options should probably not exist in the final API,
    # but let's have them here anyway
    txTo: 'bitcointx.core.CTransaction' = bitcointx.core.CTransaction(),
    inIdx: int = 0,
    flags: Set[ScriptVerifyFlag_Type] = frozenset(),
    amount: int = 0,
    # TODO: sigversion taproot or tapscript? or base, since nothing supports taproot/tapscript?
    sigversion: SIGVERSION_Type = SIGVERSION_TAPSCRIPT,
) -> None:
    """
    Evaluate tapscript, optionally ignoring signature checks
    """
    try:
        return _eval_tapscript(
            witness_elems=witness_elems,
            script=script,
            txTo=txTo,
            inIdx=inIdx,
            flags=flags,
            amount=amount,
            sigversion=sigversion,
            ignore_signature_errors=ignore_signature_errors,
            verify_stack=verify_stack,
        )
    except EvalScriptError as exc:
        state = exc.state
        logger.info(
            "Script evaluation failed. Stack length: %s, Altstack length: %s.",
            len(state.stack) if state.stack is not None else None,
            len(state.altstack) if state.altstack is not None else None,
        )
        if debug:
            logger.info("Entering Python debugger. The exception is stored in variable `exc` and state in `state`")
            breakpoint()
            pass
        raise


def _eval_tapscript(
    *,
    witness_elems: List[bytes],
    script: CScript,
    txTo: 'bitcointx.core.CTransaction',
    inIdx: int,
    flags: Set[ScriptVerifyFlag_Type] = frozenset(),
    amount: int = 0,
    # TODO: sigversion taproot or tapscript? or base, since nothing supports taproot/tapscript?
    sigversion: SIGVERSION_Type = SIGVERSION_TAPSCRIPT,
    ignore_signature_errors: bool = False,
    verify_stack: bool = True,
) -> None:
    """
    Evaluate tapscript, optionally ignoring signature checks

    Forked from _EvalScript
    """
    stack = witness_elems[:]
    scriptIn = script

    altstack: List[bytes] = []
    vfExec: List[bool] = []
    pbegincodehash = 0
    nOpCount = [0]
    v_bytes: bytes
    v_int: int
    v_bool: bool
    for sop_index, (sop, sop_data, sop_pc) in enumerate(scriptIn.raw_iter()):
        logger.info("%5d: %s %s (start byte: %s)", sop_index, sop, sop_data.hex() if sop_data is not None else '(No data)', sop_pc)
        fExec = _CheckExec(vfExec)

        def get_eval_state() -> ScriptEvalState:
            return ScriptEvalState(
                sop=sop,
                sop_data=sop_data,
                sop_pc=sop_pc,
                stack=stack,
                scriptIn=scriptIn,
                txTo=txTo,
                inIdx=inIdx,
                flags=flags,
                altstack=altstack,
                vfExec=vfExec,
                pbegincodehash=pbegincodehash,
                nOpCount=nOpCount[0])

        if sop in DISABLED_OPCODES:
            raise EvalScriptError(f'opcode {_opcode_name(sop)} is disabled',
                                  get_eval_state())

        if sop > OP_16:
            nOpCount[0] += 1
            # Taproot doesn't have the limit for non-push opcodes
            # if nOpCount[0] > MAX_SCRIPT_OPCODES:
            #     raise MaxOpCountError(get_eval_state())

        def check_args(n: int) -> None:
            if len(stack) < n:
                raise MissingOpArgumentsError(get_eval_state(),
                                              expected_stack_depth=n)

        if sop <= OP_PUSHDATA4:
            assert sop_data is not None
            if len(sop_data) > MAX_SCRIPT_ELEMENT_SIZE:
                raise EvalScriptError(
                    (f'PUSHDATA of length {len(sop_data)}; '
                     f'maximum allowed is {MAX_SCRIPT_ELEMENT_SIZE}'),
                    get_eval_state())

            elif fExec:
                stack.append(sop_data)
                continue

        elif fExec or (OP_IF <= sop <= OP_ENDIF):

            if sop == OP_1NEGATE or ((sop >= OP_1) and (sop <= OP_16)):
                v_int = sop - (OP_1 - 1)
                stack.append(bitcointx.core._bignum.bn2vch(v_int))

            elif sop in _ISA_BINOP:
                _BinOp(sop, stack, get_eval_state)

            elif sop in _ISA_UNOP:
                _UnaryOp(sop, stack, get_eval_state)

            elif sop == OP_2DROP:
                check_args(2)
                stack.pop()
                stack.pop()

            elif sop == OP_2DUP:
                check_args(2)
                v1 = stack[-2]
                v2 = stack[-1]
                stack.append(v1)
                stack.append(v2)

            elif sop == OP_2OVER:
                check_args(4)
                v1 = stack[-4]
                v2 = stack[-3]
                stack.append(v1)
                stack.append(v2)

            elif sop == OP_2ROT:
                check_args(6)
                v1 = stack[-6]
                v2 = stack[-5]
                del stack[-6]
                del stack[-5]
                stack.append(v1)
                stack.append(v2)

            elif sop == OP_2SWAP:
                check_args(4)
                tmp = stack[-4]
                stack[-4] = stack[-2]
                stack[-2] = tmp

                tmp = stack[-3]
                stack[-3] = stack[-1]
                stack[-1] = tmp

            elif sop == OP_3DUP:
                check_args(3)
                v1 = stack[-3]
                v2 = stack[-2]
                v3 = stack[-1]
                stack.append(v1)
                stack.append(v2)
                stack.append(v3)

            elif sop == OP_CHECKMULTISIG or sop == OP_CHECKMULTISIGVERIFY:
                tmpScript = scriptIn.__class__(scriptIn[pbegincodehash:])
                _CheckMultiSig(sop, tmpScript, stack, txTo, inIdx, flags,
                               get_eval_state, nOpCount,
                               amount=amount, sigversion=sigversion)

            elif sop == OP_CHECKSIG or sop == OP_CHECKSIGVERIFY:
                check_args(2)
                vchPubKey = stack[-1]
                vchSig = stack[-2]

                # Subset of script starting at the most recent codeseparator
                tmpScript = scriptIn.__class__(scriptIn[pbegincodehash:])

                if sigversion == SIGVERSION_BASE:
                    # Drop the signature in pre-segwit scripts but not segwit scripts
                    tmpScript = FindAndDelete(tmpScript,
                                              scriptIn.__class__([vchSig]))

                ok = checksig_tapscript(
                    vchSig,
                    vchPubKey,
                    tmpScript,
                    txTo,
                    inIdx,
                    flags,
                    amount=amount,
                    sigversion=sigversion,
                    ignore_errors=ignore_signature_errors,
                )
                if not ok and SCRIPT_VERIFY_NULLFAIL in flags and len(vchSig):
                    raise VerifyScriptError("signature check failed, and signature is not empty")
                if not ok and sop == OP_CHECKSIGVERIFY:
                    raise VerifyOpFailedError(get_eval_state())

                else:
                    stack.pop()
                    stack.pop()

                    if ok:
                        if sop != OP_CHECKSIGVERIFY:
                            stack.append(b"\x01")
                    else:
                        # FIXME: this is incorrect, but not caught by existing
                        # test cases
                        stack.append(b"\x00")

            elif sop == OP_CODESEPARATOR:
                pbegincodehash = sop_pc

            elif sop == OP_DEPTH:
                bn = len(stack)
                stack.append(bitcointx.core._bignum.bn2vch(bn))

            elif sop == OP_DROP:
                check_args(1)
                stack.pop()

            elif sop == OP_DUP:
                check_args(1)
                v_bytes = stack[-1]
                stack.append(v_bytes)

            elif sop == OP_ELSE:
                if len(vfExec) == 0:
                    raise EvalScriptError('ELSE found without prior IF',
                                          get_eval_state())
                vfExec[-1] = not vfExec[-1]

            elif sop == OP_ENDIF:
                if len(vfExec) == 0:
                    raise EvalScriptError('ENDIF found without prior IF',
                                          get_eval_state())
                vfExec.pop()

            elif sop == OP_EQUAL:
                check_args(2)
                v1 = stack.pop()
                v2 = stack.pop()

                if v1 == v2:
                    stack.append(b"\x01")
                else:
                    stack.append(b"")

            elif sop == OP_EQUALVERIFY:
                check_args(2)
                v1 = stack[-1]
                v2 = stack[-2]

                if v1 == v2:
                    stack.pop()
                    stack.pop()
                else:
                    raise VerifyOpFailedError(get_eval_state())

            elif sop == OP_FROMALTSTACK:
                if len(altstack) < 1:
                    raise EvalScriptError(
                        'Attempted to pop from an empty altstack',
                        get_eval_state(),
                    )
                v_bytes = altstack.pop()
                stack.append(v_bytes)

            elif sop == OP_HASH160:
                check_args(1)
                stack.append(bitcointx.core.serialize.Hash160(stack.pop()))

            elif sop == OP_HASH256:
                check_args(1)
                stack.append(bitcointx.core.serialize.Hash(stack.pop()))

            elif sop == OP_IF or sop == OP_NOTIF:
                val = False

                if fExec:
                    check_args(1)
                    vch = stack.pop()

                    if sigversion == SIGVERSION_WITNESS_V0 and SCRIPT_VERIFY_MINIMALIF in flags:
                        if len(vch) > 1:
                            raise VerifyScriptError("SCRIPT_VERIFY_MINIMALIF check failed")
                        if len(vch) == 1 and vch[0] != 1:
                            raise VerifyScriptError("SCRIPT_VERIFY_MINIMALIF check failed")

                    val = _CastToBool(vch)
                    if sop == OP_NOTIF:
                        val = not val

                vfExec.append(val)

            elif sop == OP_IFDUP:
                check_args(1)
                vch = stack[-1]
                if _CastToBool(vch):
                    stack.append(vch)

            elif sop == OP_NIP:
                check_args(2)
                del stack[-2]

            elif sop == OP_NOP:
                pass

            elif sop >= OP_NOP1 and sop <= OP_NOP10:
                if SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS in flags:
                    raise EvalScriptError((f"{_opcode_name(sop)} reserved "
                                           f"for soft-fork upgrades"),
                                          get_eval_state())
                else:
                    pass

            elif sop == OP_OVER:
                check_args(2)
                vch = stack[-2]
                stack.append(vch)

            elif sop == OP_PICK or sop == OP_ROLL:
                check_args(2)
                raw_stack_item = stack.pop()
                n = _CastToBigNum(raw_stack_item, get_eval_state)
                if n < 0 or n >= len(stack):
                    raise EvalScriptError(
                        f"Argument for {_opcode_name(sop)} out of bounds "
                        f"(n_raw={raw_stack_item.hex()} n_bignum={n}, stack size={len(stack)})",
                        get_eval_state())
                vch = stack[-n-1]
                if sop == OP_ROLL:
                    del stack[-n-1]
                stack.append(vch)

            elif sop == OP_RETURN:
                raise EvalScriptError("OP_RETURN called", get_eval_state())

            elif sop == OP_RIPEMD160:
                check_args(1)
                stack.append(bitcointx.core._ripemd160.ripemd160(stack.pop()))

            elif sop == OP_ROT:
                check_args(3)
                tmp = stack[-3]
                stack[-3] = stack[-2]
                stack[-2] = tmp

                tmp = stack[-2]
                stack[-2] = stack[-1]
                stack[-1] = tmp

            elif sop == OP_SIZE:
                check_args(1)
                bn = len(stack[-1])
                stack.append(bitcointx.core._bignum.bn2vch(bn))

            elif sop == OP_SHA1:
                check_args(1)
                stack.append(hashlib.sha1(stack.pop()).digest())

            elif sop == OP_SHA256:
                check_args(1)
                stack.append(hashlib.sha256(stack.pop()).digest())

            elif sop == OP_SWAP:
                check_args(2)
                tmp = stack[-2]
                stack[-2] = stack[-1]
                stack[-1] = tmp

            elif sop == OP_TOALTSTACK:
                check_args(1)
                v_bytes = stack.pop()
                altstack.append(v_bytes)

            elif sop == OP_TUCK:
                check_args(2)
                vch = stack[-1]
                stack.insert(len(stack) - 2, vch)

            elif sop == OP_VERIFY:
                check_args(1)
                v_bool = _CastToBool(stack[-1])
                if v_bool:
                    stack.pop()
                else:
                    raise VerifyOpFailedError(get_eval_state())

            elif sop == OP_WITHIN:
                check_args(3)
                bn3 = _CastToBigNum(stack[-1], get_eval_state)
                bn2 = _CastToBigNum(stack[-2], get_eval_state)
                bn1 = _CastToBigNum(stack[-3], get_eval_state)
                stack.pop()
                stack.pop()
                stack.pop()
                v_bool = (bn2 <= bn1) and (bn1 < bn3)
                if v_bool:
                    stack.append(b"\x01")
                else:
                    # FIXME: this is incorrect, but not caught by existing
                    # test cases
                    stack.append(b"\x00")

            else:
                raise EvalScriptError('unsupported opcode 0x%x' % sop,
                                      get_eval_state())

        # size limits
        if len(stack) + len(altstack) > MAX_STACK_ITEMS:
            raise EvalScriptError('max stack items limit reached',
                                  get_eval_state())

    # Unterminated IF/NOTIF/ELSE block
    if len(vfExec):
        raise EvalScriptError(
            'Unterminated IF/ELSE block',
            ScriptEvalState(stack=stack, altstack=altstack, scriptIn=scriptIn,
                            txTo=txTo, inIdx=inIdx, flags=flags))

    if verify_stack:
        if len(stack) != 1:
            raise EvalScriptError(
                f'stack size must be exactly one after execution (got {len(stack)})',
                ScriptEvalState(stack=stack, altstack=altstack, scriptIn=scriptIn,
                                txTo=txTo, inIdx=inIdx, flags=flags))

        if not any(stack[0]):
            raise EvalScriptError(
                'top stack element is false',
                ScriptEvalState(stack=stack, altstack=altstack, scriptIn=scriptIn,
                                txTo=txTo, inIdx=inIdx, flags=flags))


def checksig_tapscript(
    sig: bytes,
    pubkey: bytes,
    script: CScript,
    txTo: 'bitcointx.core.CTransaction',
    inIdx: int,
    flags: Set[ScriptVerifyFlag_Type],
    amount: int = 0,
    sigversion: SIGVERSION_Type = SIGVERSION_BASE,
    ignore_errors: bool = False,
) -> bool:
    # TODO: make it actually work with the signature checks, not just if ignore_errors=True
    try:
        ret = _CheckSig(sig, pubkey, script, txTo, inIdx, flags, amount, sigversion)
    except (VerifyOpFailedError, ValueError) as e:
        if ignore_errors:
            logger.warning("Ignoring signature check error: %s", e)
            return True
        raise

    if not ret and ignore_errors:
        logger.warning("Ignoring invalid signature")
        return True

    return ret
