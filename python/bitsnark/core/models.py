from __future__ import annotations
import datetime
import enum
from typing import TypedDict, Optional, ClassVar, Any
from sqlalchemy.orm import Mapped, mapped_column, declarative_base
from sqlalchemy import Column, Integer, JSON, String, Boolean, TIMESTAMP, Enum
from sqlalchemy.schema import FetchedValue


class OutgoingStatus(enum.Enum):
    PENDING = 'PENDING'
    READY = 'READY'
    PUBLISHED = 'PUBLISHED'
    REJECTED = 'REJECTED'


class SetupStatus(enum.Enum):
    PENDING = 'PENDING'
    READY = 'READY'
    SIGNED = 'SIGNED'
    FAILED = 'FAILED'


Base = declarative_base()


class TransactionTemplate(Base):
    __tablename__ = 'templates'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    setup_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ordinal: Mapped[Optional[int]] = Column(Integer)
    object: Mapped[dict] = mapped_column(JSON, nullable=False)
    outgoing_status: Mapped[str] = mapped_column(Enum(OutgoingStatus), nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(TIMESTAMP, server_default=FetchedValue(), nullable=False)

    def __repr__(self):
        return (
            f"<TransactionTemplate(name={self.name}, "
            f"setup_id={self.setup_id}, id={self.id}, ordinal={self.ordinal}, "
            f"role={self.role}, is_external={self.is_external}, object=...)>")

    @property
    def inputs(self) -> list[TxInJson]:
        return self.object['inputs']

    @property
    def outputs(self) -> list[TxOutJson]:
        return self.object['outputs']


JsonHexStr = str
JsonBigNum = str


class Setups(Base):
    __tablename__ = 'setups'
    id: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    protocol_version: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(Enum(SetupStatus), nullable=False)
    last_checked_block_height: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime.datetime] = mapped_column(TIMESTAMP, server_default=FetchedValue(), nullable=False)


class TxJson(TypedDict):
    role: str
    transactionName: str
    inputs: list[TxInJson]
    outputs: list[TxOutJson]
    ordinal: int
    protocolVersion: str


class TxInJson(TypedDict):
    transactionName: str
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
