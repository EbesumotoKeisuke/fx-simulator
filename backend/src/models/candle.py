from sqlalchemy import Column, BigInteger, String, DECIMAL, TIMESTAMP, Index
from sqlalchemy.sql import func

from src.utils.database import Base


class Candle(Base):
    __tablename__ = "candles"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    timeframe = Column(String(10), nullable=False)
    timestamp = Column(TIMESTAMP, nullable=False)
    open = Column(DECIMAL(10, 5), nullable=False)
    high = Column(DECIMAL(10, 5), nullable=False)
    low = Column(DECIMAL(10, 5), nullable=False)
    close = Column(DECIMAL(10, 5), nullable=False)
    volume = Column(BigInteger, default=0)
    created_at = Column(TIMESTAMP, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_candles_timeframe_timestamp", "timeframe", "timestamp", unique=True),
        Index("idx_candles_timestamp", "timestamp"),
    )
