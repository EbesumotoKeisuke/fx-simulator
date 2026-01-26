from sqlalchemy import Column, String, DECIMAL, TIMESTAMP, ForeignKey, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from src.utils.database import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id = Column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    side = Column(String(10), nullable=False)
    lot_size = Column(DECIMAL(10, 2), nullable=False)
    entry_price = Column(DECIMAL(10, 5), nullable=False)
    status = Column(String(20), nullable=False, default="open")
    opened_at = Column(TIMESTAMP, nullable=False)
    closed_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    simulation = relationship("Simulation", backref="positions")
    order = relationship("Order", backref="position")

    __table_args__ = (
        CheckConstraint("side IN ('buy', 'sell')", name="chk_positions_side"),
        CheckConstraint("status IN ('open', 'closed')", name="chk_positions_status"),
        Index("idx_positions_simulation_id", "simulation_id"),
        Index("idx_positions_status", "status"),
        Index("idx_positions_simulation_status", "simulation_id", "status"),
    )
