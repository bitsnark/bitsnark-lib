from __future__ import annotations
from typing import TypedDict, Optional, Any
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import Column, Integer, JSON, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class TransactionTemplate(Base):
    __tablename__ = 'transaction_templates'

    agent_id: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    setup_id: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    name: Mapped[str] = mapped_column(String, primary_key=True, nullable=False)
    object: Mapped[dict] = mapped_column(JSON, nullable=False)
    tx_id: Mapped[Optional[str]] = mapped_column(String)
    ordinal: Mapped[Optional[int]] = Column(Integer)

    def __repr__(self):
        return f"<TransactionTemplate(name={self.name}, agent_id={self.agent_id}, setup_id={self.setup_id}, tx_id={self.tx_id}, ordinal={self.ordinal}, object=...)>"

    @property
    def inputs(self) -> list[TxInJson]:
        return self.object['inputs']

    @property
    def outputs(self) -> list[TxOutJson]:
        return self.object['outputs']

    @property
    def role(self) -> str:
        return self.object['role']


JsonHexStr = str
JsonBigNum = str


class TxJson(TypedDict):
    role: str
    transactionName: str
    inputs: list[TxInJson]
    outputs: list[TxOutJson]
    ordinal: int
    protocolVersion: float


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
