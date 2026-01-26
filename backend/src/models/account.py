from sqlalchemy import Column, DECIMAL, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from src.utils.database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id = Column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False, unique=True)
    initial_balance = Column(DECIMAL(15, 2), nullable=False)
    balance = Column(DECIMAL(15, 2), nullable=False)
    equity = Column(DECIMAL(15, 2), nullable=False)
    realized_pnl = Column(DECIMAL(15, 2), nullable=False, default=0)
    updated_at = Column(TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now())

    simulation = relationship("Simulation", backref="account")
