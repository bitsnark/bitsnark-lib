# dummy file for now. move transaction-specific reusable logic here in the future
from dataclasses import dataclass

from bitcointx.core import CTransaction, CTxIn, CTxOut, COutPoint
from bitcointx.core.key import CKey
from bitcointx.core.script import CScript
from sqlalchemy.orm.session import Session
from .models import TransactionTemplate
from .parsing import parse_bignum, parse_hex_bytes, serialize_hex
from . import signing


class MissingScript(ValueError):
    pass


@dataclass(repr=False)
class SignableTransaction:
    tx: CTransaction
    spent_outputs: list[CTxOut]
    input_tapscripts: list[CScript]
    template_name: str
    setup_id: str

    def __repr__(self):
        return f"<SignableTransaction(name={self.template_name}, txid={self.txid})>"

    @property
    def txid(self) -> str:
        return self.tx.GetTxid()[::-1].hex()

    def sign_input_at(
        self,
        *,
        index: int,
        private_key: CKey,
    ) -> bytes:
        return signing.sign_input(
            script=self.input_tapscripts[index],
            tx=self.tx,
            input_index=index,
            spent_outputs=self.spent_outputs,
            private_key=private_key,
        )

    def sign_all_inputs(self, private_key: CKey) -> list[bytes]:
        return [
            self.sign_input_at(index=index, private_key=private_key)
            for index in range(len(self.tx.vin))
        ]

    def verify_input_signature_at(
        self,
        *,
        index: int,
        public_key: bytes,
        signature: bytes,
    ) -> None:
        signing.verify_input_signature(
            script=self.input_tapscripts[index],
            tx=self.tx,
            input_index=index,
            spent_outputs=self.spent_outputs,
            signature=signature,
            public_key=public_key,
        )


def construct_signable_transaction(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
) -> SignableTransaction:
    if tx_template.is_external:
        raise ValueError(f"Transaction {tx_template.name} is external and cannot be signed")

    tx_inputs: list[CTxIn] = []
    spent_outputs: list[CTxOut] = []
    input_tapscripts: list[CScript] = []
    for input_index, inp in enumerate(tx_template.inputs):
        prev_tx = dbsession.query(TransactionTemplate).filter_by(
            setup_id=tx_template.setup_id,
            name=inp['templateName'],
        ).one()
        if not prev_tx:
            raise KeyError(f"Transaction {inp['templateName']} not found")

        prev_txid = prev_tx.txid
        if not prev_txid:
            raise ValueError(f"Transaction {inp['templateName']} has no txId")

        prevout_index = inp['outputIndex']
        prevout = prev_tx.outputs[prevout_index]

        try:
            prev_tx_hash = bytes.fromhex(prev_txid)[::-1]
        except ValueError as e:
            raise ValueError(
                f"Invalid txid {prev_txid} for transaction {prev_tx.name} "
                f"(required by {tx_template.name} input #{input_index})"
            ) from e

        spending_condition = prevout['spendingConditions'][inp['spendingConditionIndex']]
        timeout_blocks = spending_condition.get('timeoutBlocks')
        sequence = 0xffffffff
        if timeout_blocks is not None:
            sequence = timeout_blocks

        tx_inputs.append(
            CTxIn(
                prevout=COutPoint(
                    hash=prev_tx_hash,
                    n=inp['outputIndex'],
                ),
                nSequence=sequence,
            )
        )

        spent_outputs.append(CTxOut(
            nValue=parse_bignum(prevout['amount']),
            scriptPubKey=CScript(parse_hex_bytes(prevout['taprootKey']))
        ))

        script_raw = inp.get('script', spending_condition.get('script'))
        if script_raw is None:
            raise MissingScript(
                f"Spending condition {inp['spendingConditionIndex']} for transaction {prev_tx.name} "
                f"(required by {tx_template.name} input #{input_index}) has no script"
            )

        input_tapscripts.append(
            CScript(parse_hex_bytes(script_raw))
        )

    tx_outputs = []
    for output_index, out in enumerate(tx_template.outputs):
        amount_raw = out.get('amount')
        script_pubkey_raw = out.get('taprootKey')
        keys = ", ".join(out.keys())

        if amount_raw is None:
            raise ValueError(f"Transaction {tx_template.name} output {output_index} has no amount. Keys: {keys}")
        if script_pubkey_raw is None:
            raise ValueError(f"Transaction {tx_template.name} output {output_index} has no taprootKey. Keys: {keys}")

        amount = parse_bignum(amount_raw)
        script_pubkey = CScript(parse_hex_bytes(script_pubkey_raw))
        tx_outputs.append(
            CTxOut(
                nValue=amount,
                scriptPubKey=script_pubkey,
            )
        )

    tx = CTransaction(
        vin=tx_inputs,
        vout=tx_outputs,
        nVersion=2,
    )
    signable_tx = SignableTransaction(
        tx=tx,
        spent_outputs=spent_outputs,
        input_tapscripts=input_tapscripts,
        template_name=tx_template.name,
        setup_id=tx_template.setup_id,
    )
    if signable_tx.txid != tx_template.txid:
        raise ValueError(
            f"Constructed transaction id {signable_tx.txid} does not match template txid {tx_template.txid} "
            f"(name: {tx_template.name})"
        )
    return signable_tx
