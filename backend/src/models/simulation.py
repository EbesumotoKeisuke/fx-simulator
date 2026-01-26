from sqlalchemy import Column, String, DECIMAL, TIMESTAMP, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from src.utils.database import Base


class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(String(20), nullable=False, default="created")
    start_time = Column(TIMESTAMP, nullable=False)
    end_time = Column(TIMESTAMP, nullable=True)
    current_time = Column(TIMESTAMP, nullable=False)
    speed = Column(DECIMAL(5, 2), nullable=False, default=1.0)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("idx_simulations_status", "status"),
        Index("idx_simulations_created_at", "created_at"),
    )
