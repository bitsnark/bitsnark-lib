from __future__ import annotations

from bitcointx.core.key import CKey
from bitcointx.core import CTransaction, CTxIn, CTxOut, COutPoint

from typing import (
    NotRequired,
    TypedDict,
)

from bitcointx.core.script import CScript

from ._base import run_py_client_script
from ..core.types import HexStr


class InputParams(TypedDict):
    inputs: list[TxInput]  # list of inputs from previous transactions used to fund this transaction
    outputValue: HexStr  # the number of satoshi sent to the single output. serialized as hex because of JS and bigints.
    # TODO: the final transaction in the chain would need to spend to an arbitrary scriptPubKey and would
    #   thus not have the execution script, nor require the signature
    schnorrPrivateKey: HexStr  # the private key to sign the single output with
    outputScriptPubKey: HexStr  # the scriptPubKey of the single output of this transaction
    executionScript: HexStr  # the script that spends the transaction in the happy case scenario


class TxInput(TypedDict):
    txid: HexStr  # previous tx id in hex. note that this is txid ie reverse of tx hash!
    vout: int     # index of output in previous transaction
    # spentOutput is required for creating the signature
    # note that we could also obtain this from the bitcoin rpc, using txid and vout!
    spentOutput: NotRequired[SpentOutput]


class SpentOutput(TypedDict):
    scriptPubKey: HexStr
    value: HexStr  # serialized as hex because of JS.


class SignedTaprootTransactionResult(TypedDict):
    txid: HexStr  # txid as it would appear on block explorers (hex encoded reverse of tx hash)
    executionSignature: HexStr  # the signature needed from this party to execute executionScript
    transaction: HexStr  # serialized transaction without witness data


def create_presigned_transaction(params: InputParams) -> SignedTaprootTransactionResult:
    """
    Create a Bitsnark transaction with a single output, and the signature required from this party to spend that output
    """
    tx_version = 2
    private_key = CKey.fromhex(params["schnorrPrivateKey"])
    execution_script = CScript.fromhex(params["executionScript"])

    # NOTE: For now, each transaction only has a single output
    outputs: list[CTxOut] = [
        CTxOut(
            nValue=int(params["outputValue"], 16),
            scriptPubKey=CScript.fromhex(params["outputScriptPubKey"]),
        ),
    ]

    inputs: list[CTxIn] = []
    spent_outputs: list[CTxOut] = []

    for input_index, input_data in enumerate(params["inputs"]):
        inputs.append(CTxIn(
            prevout=COutPoint(
                hash=bytes.fromhex(input_data["txid"])[::-1],
                n=input_data["vout"],
            ),
        ))
        if "spentOutput" not in input_data:
            raise ValueError(
                f"input at index {input_index} does not have an attached spentOutput, which is required "
                f"before support for bitcoin rpc is added"
            )
        prevout_script_pubkey = CScript.fromhex(input_data["spentOutput"]["scriptPubKey"])
        if not prevout_script_pubkey.is_witness_scriptpubkey():
            raise ValueError(
                f"input at index {input_index} is not a segwit input, which is required for deterministic tx ids"
            )
        spent_outputs.append(CTxOut(
            nValue=int(input_data["spentOutput"]["value"], 16),
            scriptPubKey=prevout_script_pubkey,
        ))

    tx = CTransaction(
        vin=inputs,
        vout=outputs,
        nVersion=tx_version,
    )

    sighash = execution_script.sighash_schnorr(tx, 0, spent_outputs=spent_outputs)
    signature = private_key.sign_schnorr_no_tweak(sighash)

    return {
        "txid": HexStr(tx.GetTxid().hex()),  # TODO: need to double check the endianness of this!
        "executionSignature": HexStr(signature.hex()),
        "transaction": HexStr(tx.serialize().hex()),
    }


if __name__ == '__main__':
    run_py_client_script(create_presigned_transaction)
