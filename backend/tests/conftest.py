"""
テスト用フィクスチャ

pytestで使用するテスト用のフィクスチャを定義する。
SQLiteのインメモリDBを使用してテストを実行する。
"""

import pytest
import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import create_engine, String
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects.sqlite import base as sqlite_base

from src.utils.database import Base
from src.models.candle import Candle
from src.models.simulation import Simulation
from src.models.account import Account
from src.models.order import Order  # noqa: F401 - positions.order_id FK解決に必要
from src.models.position import Position
from src.models.trade import Trade


# SQLite用にUUID型をVARCHAR(36)としてレンダリング
def visit_uuid(self, type_, **kw):
    return "VARCHAR(36)"


# UUID型のカスタムコンパイラを登録
sqlite_base.SQLiteTypeCompiler.visit_UUID = visit_uuid


@pytest.fixture
def test_engine():
    """テスト用のSQLiteインメモリエンジンを作成"""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def test_db(test_engine):
    """テスト用のDBセッションを作成"""
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def sample_candles(test_db):
    """テスト用のローソク足データを作成"""
    candles = []
    base_time = datetime(2024, 1, 15, 9, 0, 0)  # 月曜日9:00

    for i in range(10):
        candle = Candle(
            timeframe="M10",
            timestamp=datetime(2024, 1, 15, 9, i * 10, 0),  # 10分間隔
            open=Decimal("150.00") + Decimal(str(i * 0.01)),
            high=Decimal("150.10") + Decimal(str(i * 0.01)),
            low=Decimal("149.90") + Decimal(str(i * 0.01)),
            close=Decimal("150.05") + Decimal(str(i * 0.01)),
            volume=1000 + i * 100
        )
        candles.append(candle)
        test_db.add(candle)

    test_db.commit()
    return candles


@pytest.fixture
def sample_simulation(test_db):
    """テスト用のシミュレーションを作成"""
    simulation = Simulation(
        id=uuid.uuid4(),
        start_time=datetime(2024, 1, 15, 9, 0, 0),
        current_time=datetime(2024, 1, 15, 9, 30, 0),
        speed=Decimal("1.0"),
        status="running"
    )
    test_db.add(simulation)
    test_db.flush()

    account = Account(
        id=uuid.uuid4(),
        simulation_id=simulation.id,
        initial_balance=Decimal("1000000"),
        balance=Decimal("1000000"),
        equity=Decimal("1000000"),
        realized_pnl=Decimal("0"),
        consecutive_losses=0
    )
    test_db.add(account)
    test_db.commit()

    return simulation


@pytest.fixture
def sample_account(test_db, sample_simulation):
    """テスト用の口座を取得"""
    return test_db.query(Account).filter(
        Account.simulation_id == sample_simulation.id
    ).first()
