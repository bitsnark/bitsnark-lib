from dataclasses import dataclass
from typing import NewType

HexStr = NewType("HexStr", str)


@dataclass(frozen=True)
class TxIn:
    txid: HexStr
    vout: int


@dataclass(frozen=True)
class TxOut:
    script_pubkey: str
    amount: int
