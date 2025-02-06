from __future__ import annotations
from dataclasses import dataclass

from bitcointx.core import CTransaction, CTxIn, CTxOut, COutPoint, CTxInWitness, CTxWitness
from bitcointx.core.key import CKey
from bitcointx.core.script import CScript, CScriptWitness
import sqlalchemy as sa
from sqlalchemy.orm.session import Session
from .models import TransactionTemplate
from .parsing import parse_bignum, parse_hex_bytes
from . import signing


class MissingScript(ValueError):
    pass


@dataclass(repr=False)
class SignedTransaction:
    tx: CTransaction
    signable_tx: SignableTransaction

    def __repr__(self):
        return f"<SignedTransaction(name={self.signable_tx.template_name}, txid={self.txid})>"

    @property
    def txid(self) -> str:
        return self.tx.GetTxid()[::-1].hex()


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

    @property
    def inputs(self) -> list[SignableInput]:
        return [
            SignableInput(signable_tx=self, index=i)
            for i, _ in enumerate(self.tx.vin)
        ]

    def sign_input_at(
        self,
        *,
        index: int,
        private_key: CKey,
        hashtype: signing.SIGHASH_Type | None = signing.DEFAULT_HASHTYPE,
    ) -> bytes:
        return signing.sign_input(
            script=self.input_tapscripts[index],
            tx=self.tx,
            input_index=index,
            spent_outputs=self.spent_outputs,
            private_key=private_key,
            hashtype=hashtype,
        )

    def verify_input_signature_at(
        self,
        *,
        index: int,
        public_key: bytes,
        signature: bytes,
        hashtype: signing.SIGHASH_Type | None = signing.DEFAULT_HASHTYPE,
    ) -> None:
        signing.verify_input_signature(
            script=self.input_tapscripts[index],
            tx=self.tx,
            input_index=index,
            spent_outputs=self.spent_outputs,
            signature=signature,
            public_key=public_key,
            hashtype=hashtype,
        )


@dataclass()
class SignableInput:
    signable_tx: SignableTransaction
    index: int

    def sign(
        self,
        private_key: CKey,
        *,
        hashtype: signing.SIGHASH_Type | None = signing.DEFAULT_HASHTYPE,
    ) -> bytes:
        return self.signable_tx.sign_input_at(
            index=self.index,
            private_key=private_key,
            hashtype=hashtype,
        )

    def verify_signature(
        self,
        public_key: bytes,
        signature: bytes,
        *,
        hashtype: signing.SIGHASH_Type | None = signing.DEFAULT_HASHTYPE,
    ):
        self.signable_tx.verify_input_signature_at(
            index=self.index,
            public_key=public_key,
            signature=signature,
            hashtype=hashtype,
        )


def construct_signable_transaction(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
    ignore_funded_inputs_and_outputs: bool = False,
) -> SignableTransaction:
    if tx_template.is_external:
        raise ValueError(f"Transaction {tx_template.name} is external and cannot be signed")

    tx_inputs: list[CTxIn] = []
    spent_outputs: list[CTxOut] = []
    input_tapscripts: list[CScript] = []
    for input_index, inp in enumerate(tx_template.inputs):
        if inp.get("funded"):
            if not ignore_funded_inputs_and_outputs:
                raise ValueError(f"Transaction {tx_template.name} has funded inputs")
            if not tx_template.fundable:
                raise ValueError(f"Fundable input in a non-fundable transaction {tx_template.name}")
            continue
        prev_tx = dbsession.query(TransactionTemplate).filter_by(
            setup_id=tx_template.setup_id,
            name=inp['templateName'],
        ).one()
        if not prev_tx:
            raise KeyError(f"Transaction {inp['templateName']} not found")

        prev_txid = prev_tx.txid
        if not prev_txid:
            raise ValueError(f"Transaction {inp['templateName']} has no txId")

        if prev_tx.unknown_txid:
            raise ValueError(f"Transaction {inp['templateName']} has unknown txId")

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
        if out.get("funded"):
            if not ignore_funded_inputs_and_outputs:
                raise ValueError(f"Transaction {tx_template.name} has funded outputs")
            if not tx_template.fundable:
                raise ValueError(f"Fundable output in a non-fundable transaction {tx_template.name}")
            continue
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

    # Double-check that if the template has a set tx_id, it is the same as the calculated id if the constructed tx.
    # Note that template's txid can also be 'undefined'
    # If we're ignoring funded inputs and outputs, we cannot do this check here -- it has to be done by the caller
    if tx_template.txid and tx_template.txid != 'undefined' and not ignore_funded_inputs_and_outputs:
        if signable_tx.txid != tx_template.txid:
            raise ValueError(
                f"Constructed transaction id {signable_tx.txid} does not match template txid {tx_template.txid} "
                f"(name: {tx_template.name})"
            )
    return signable_tx


def construct_signed_transaction(
    *,
    tx_template: TransactionTemplate,
    dbsession: Session,
    ignore_funded_inputs_and_outputs: bool = False,
) -> SignedTransaction:
    signable_tx = construct_signable_transaction(
        tx_template=tx_template,
        dbsession=dbsession,
        ignore_funded_inputs_and_outputs=ignore_funded_inputs_and_outputs,
    )
    tx = signable_tx.tx.to_mutable()
    if tx.wit is not None and tx.wit.serialize().strip(b'\x00'):
        raise ValueError(f"Transaction {tx_template.name} already has witness data")
    input_witnesses = []

    for input_index, inp in enumerate(tx_template.inputs):
        if inp.get('funded'):
            if not ignore_funded_inputs_and_outputs:
                raise ValueError(f"Transaction {tx_template.name} has funded inputs")
            continue

        prev_tx = dbsession.execute(
            sa.select(TransactionTemplate).filter_by(
                setup_id=tx_template.setup_id,
                name=inp['templateName'],
            )
        ).scalar_one()

        prevout_index = inp['outputIndex']
        prevout = prev_tx.outputs[prevout_index]
        spending_condition = prevout['spendingConditions'][
            inp['spendingConditionIndex']
        ]

        signature_type = spending_condition['signatureType']
        if signature_type not in ('PROVER', 'VERIFIER', 'BOTH'):
            raise ValueError(
                f"Transaction {tx_template.name} input #{input_index} spending condition "
                f"#{inp['spendingConditionIndex']} has unknown signatureType {signature_type}"
            )

        signatures: list[bytes] = []

        if signature_type in ('VERIFIER', 'BOTH'):
            verifier_signature_raw = inp.get('verifierSignature')
            if not verifier_signature_raw:
                raise ValueError(f"Transaction {tx_template.name} input #{input_index} has no verifierSignature")
            verifier_signature = parse_hex_bytes(verifier_signature_raw)
            signatures.append(verifier_signature)

        if signature_type in ('PROVER', 'BOTH'):
            prover_signature_raw = inp.get('proverSignature')
            if not prover_signature_raw:
                raise ValueError(f"Transaction {tx_template.name} input #{input_index} has no proverSignature")
            prover_signature = parse_hex_bytes(prover_signature_raw)
            signatures.append(prover_signature)

        # TODO: refactor this so that it always uses inp['script']
        script_raw = inp.get('script', spending_condition.get('script'))
        if script_raw is None:
            raise ValueError(
                f"Transaction {tx_template.name} input #{input_index} has no script or spendingCondition script"
            )
        tapscript = CScript(parse_hex_bytes(script_raw))

        if tx_template.protocol_data:
            witness = [
                parse_hex_bytes(s) for s in
                tx_template.protocol_data[prevout_index]
            ]
        else:
            witness = []

        # TODO: refactor it to always use inp['controlBlock']
        control_block_raw = inp.get('controlBlock', spending_condition.get('controlBlock'))
        if control_block_raw is None:
            raise ValueError(
                f"Transaction {tx_template.name} input #{input_index} has no controlBlock or spendingCondition controlBlock"
            )
        control_block = parse_hex_bytes(control_block_raw)

        input_witness = CTxInWitness(CScriptWitness(
            stack=[
                *witness,
                *signatures,
                tapscript,
                control_block,
            ],
        ))
        input_witnesses.append(input_witness)

    tx.wit = CTxWitness(vtxinwit=input_witnesses)
    return SignedTransaction(
        tx=tx.to_immutable(),
        signable_tx=signable_tx,
    )
