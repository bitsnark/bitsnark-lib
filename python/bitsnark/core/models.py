from __future__ import annotations
import datetime
import enum
from typing import TypedDict, Optional, ClassVar, Any
from sqlalchemy.orm import Mapped, mapped_column, declarative_base
from sqlalchemy import Column, Integer, JSON, String, Boolean, TIMESTAMP, Enum
from sqlalchemy.schema import FetchedValue


class SetupStatus(enum.Enum):
    PENDING = 'PENDING'
    READY = 'READY'
    SIGNED = 'SIGNED'
    FAILED = 'FAILED'


class OutgoingStatus(enum.Enum):
    PENDING = 'PENDING'
    READY = 'READY'
    PUBLISHED = 'PUBLISHED'
    REJECTED = 'REJECTED'


Base = declarative_base()


class Setups(Base):
    __tablename__ = 'setups'
    id: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    protocol_version: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(Enum(SetupStatus), nullable=False)
    last_checked_block_height: Mapped[Optional[int]] = mapped_column(Integer)
    payload_txid: Mapped[Optional[str]] = mapped_column(String)
    payload_output_index: Mapped[Optional[int]] = mapped_column(Integer)
    payload_amount: Mapped[Optional[int]] = mapped_column(Integer)
    stake_txid: Mapped[Optional[str]] = mapped_column(String)
    stake_output_index: Mapped[Optional[int]] = mapped_column(Integer)
    stake_amount: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime.datetime] = mapped_column(TIMESTAMP, server_default=FetchedValue(), nullable=False)


class TransactionTemplate(Base):
    __tablename__ = 'templates'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    txid: Mapped[str] = mapped_column(String, nullable=False)
    setup_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ordinal: Mapped[Optional[int]] = Column(Integer)
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    outputs: Mapped[dict] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(Enum(OutgoingStatus), nullable=False)
    tx_data: Mapped[Optional[dict]] = mapped_column(JSON)
    protocol_data: Mapped[Optional[dict]] = mapped_column(JSON)
    updated_at: Mapped[datetime.datetime] = mapped_column(TIMESTAMP, server_default=FetchedValue(), nullable=False)

    def __repr__(self):
        return (
            f"<TransactionTemplate(name={self.name}, "
            f"setup_id={self.setup_id}, id={self.id}, ordinal={self.ordinal}, "
            f"role={self.role}, is_external={self.is_external}, inputs=..., outputs=...)>")


JsonHexStr = str
JsonBigNum = str


class TxJson(TypedDict):
    role: str
    name: str
    inputs: list[TxInJson]
    outputs: list[TxOutJson]
    ordinal: int
    protocolVersion: str


class TxInJson(TypedDict):
    templateName: str
    outputIndex: int
    spendingConditionIndex: int
    script: JsonHexStr


class TxOutJson(TypedDict):
    amount: JsonBigNum
    spendingConditions: list[SpendingConditionJson]


# TODO
# class SpendingConditionJson(TypedDict):
#     pass
SpendingConditionJson = dict[str, Any]
