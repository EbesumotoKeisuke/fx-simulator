from sqlalchemy import Column, String, DECIMAL, TIMESTAMP, ForeignKey, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid

from src.utils.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    simulation_id = Column(UUID(as_uuid=True), ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    side = Column(String(10), nullable=False)
    lot_size = Column(DECIMAL(10, 2), nullable=False)
    entry_price = Column(DECIMAL(10, 5), nullable=False)
    executed_at = Column(TIMESTAMP, nullable=False)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    simulation = relationship("Simulation", backref="orders")

    __table_args__ = (
        CheckConstraint("side IN ('buy', 'sell')", name="chk_orders_side"),
        Index("idx_orders_simulation_id", "simulation_id"),
        Index("idx_orders_executed_at", "executed_at"),
    )
