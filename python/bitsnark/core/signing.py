from bitcointx.core import CMutableTransaction, CTxOut, CTransaction
from bitcointx.core.key import CKey, XOnlyPubKey
from bitcointx.core.script import CScript, SIGHASH_Type, SIGHASH_ALL, SIGHASH_ANYONECANPAY

# DEFAULT_HASHTYPE = SIGHASH_ALL | SIGHASH_ANYONECANPAY
DEFAULT_HASHTYPE = None

def sign_input(
    *,
    script: CScript,
    tx: CTransaction | CMutableTransaction,
    input_index: int,
    spent_outputs: list[CTxOut],
    private_key: CKey,
    hashtype: SIGHASH_Type | None = DEFAULT_HASHTYPE,
) -> bytes:
    sighash = script.sighash_schnorr(
        tx,
        input_index,
        spent_outputs=spent_outputs,
        hashtype=hashtype,
    )
    return private_key.sign_schnorr_no_tweak(sighash)


class InvalidSignatureError(ValueError):
    pass


def verify_input_signature(
    *,
    script: CScript,
    tx: CTransaction | CMutableTransaction,
    input_index: int,
    spent_outputs: list[CTxOut],
    signature: bytes,
    public_key: bytes | XOnlyPubKey,
    hashtype: SIGHASH_Type | None = DEFAULT_HASHTYPE,
):
    sighash = script.sighash_schnorr(
        tx,
        input_index,
        spent_outputs=spent_outputs,
        hashtype=hashtype,
    )
    if not isinstance(public_key, XOnlyPubKey):
        public_key = XOnlyPubKey(public_key)
    if not public_key.verify_schnorr(sighash, signature):
        raise InvalidSignatureError(f"Invalid signature for input {input_index}")
