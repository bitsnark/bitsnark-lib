from bitcointx.core import CMutableTransaction, CTxOut, CTransaction
from bitcointx.core.key import CKey
from bitcointx.core.script import CScript


def sign_input(
    *,
    script: CScript,
    tx: CTransaction | CMutableTransaction,
    input_index: int,
    spent_outputs: list[CTxOut],
    private_key: CKey,
) -> bytes:
    sighash = script.sighash_schnorr(tx, input_index, spent_outputs=spent_outputs)
    return private_key.sign_schnorr_no_tweak(sighash)
