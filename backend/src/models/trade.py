from sqlalchemy import Column, String, DECIMAL, TIMESTAMP, ForeignKey, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from src.utils.database import Base


class Trade(Base):
    __tablename__ = "trades"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id = Column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    position_id = Column(UUID(as_uuid=True), ForeignKey("positions.id", ondelete="CASCADE"), nullable=False)
    side = Column(String(10), nullable=False)
    lot_size = Column(DECIMAL(10, 2), nullable=False)
    entry_price = Column(DECIMAL(10, 5), nullable=False)
    exit_price = Column(DECIMAL(10, 5), nullable=False)
    realized_pnl = Column(DECIMAL(15, 2), nullable=False)
    realized_pnl_pips = Column(DECIMAL(10, 1), nullable=False)
    opened_at = Column(TIMESTAMP, nullable=False)
    closed_at = Column(TIMESTAMP, nullable=False)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    simulation = relationship("Simulation", backref="trades")
    position = relationship("Position", backref="trade")

    __table_args__ = (
        CheckConstraint("side IN ('buy', 'sell')", name="chk_trades_side"),
        Index("idx_trades_simulation_id", "simulation_id"),
        Index("idx_trades_closed_at", "closed_at"),
    )
