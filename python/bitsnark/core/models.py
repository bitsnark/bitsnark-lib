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
    template_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    agent_id: Mapped[str] = mapped_column(String, nullable=False)
    setup_id: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    is_external: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ordinal: Mapped[Optional[int]] = Column(Integer)
    object: Mapped[dict] = mapped_column(JSON, nullable=False)

    tx_id: ClassVar[Optional[str]] = None

    def __repr__(self):
        return (
            f"<TransactionTemplate(name={self.name}, agent_id={self.agent_id}, "
            f"setup_id={self.setup_id}, template_id={self.template_id}, ordinal={self.ordinal}, "
            f"role={self.role}, is_external={self.is_external}, object=...)>")

    @property
    def inputs(self) -> list[TxInJson]:
        return self.object['inputs']

    @property
    def outputs(self) -> list[TxOutJson]:
        return self.object['outputs']


JsonHexStr = str
JsonBigNum = str


class Outgoing(Base):
    __tablename__ = 'outgoing'
    template_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(Enum(OutgoingStatus), nullable=False)
    raw_tx: Mapped[dict] = mapped_column(JSON, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated: Mapped[datetime.datetime] = mapped_column(TIMESTAMP, server_default=FetchedValue(), nullable=False)


class Setups(Base):
    __tablename__ = 'setups'
    setup_id: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    status: Mapped[str] = mapped_column(Enum(SetupStatus), nullable=False)
    protocolVersion: Mapped[str] = mapped_column(String, nullable=False)


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
