"""
売買履歴チャートAPIの結合テスト

パフォーマンス分析画面の /api/v1/analytics/trades-with-candles エンドポイントを
FastAPI TestClientで結合テストする。

テスト観点:
- APIエンドポイントのレスポンス構造が正しいこと
- min_candlesパラメータで最低80本のローソク足が返却されること
- 各時間足（W1, D1, H1, M10）で正しく動作すること
- EMAデータが含まれること
- 売買履歴がない場合のハンドリング
- min_candlesパラメータのバリデーション
"""

import pytest
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.sqlite import base as sqlite_base

from src.utils.database import Base, get_db
from src.models.candle import Candle
from src.models.simulation import Simulation
from src.models.account import Account
from src.models.order import Order
from src.models.position import Position
from src.models.trade import Trade


# SQLite用にUUID型をVARCHAR(36)としてレンダリング
def visit_uuid(self, type_, **kw):
    return "VARCHAR(36)"


sqlite_base.SQLiteTypeCompiler.visit_UUID = visit_uuid


@pytest.fixture
def integration_db():
    """結合テスト用のDBセッションを作成"""
    engine = create_engine(
        "sqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client(integration_db):
    """FastAPI TestClientを作成（テスト用AppでDB依存性をオーバーライド）"""
    from fastapi import FastAPI
    from src.routes import analytics

    # テスト用のFastAPIアプリ（lifespanなしでPostgreSQL接続を回避）
    test_app = FastAPI()
    test_app.include_router(
        analytics.router, prefix="/api/v1/analytics", tags=["Analytics"]
    )

    def override_get_db():
        try:
            yield integration_db
        finally:
            pass

    test_app.dependency_overrides[get_db] = override_get_db
    with TestClient(test_app) as c:
        yield c
    test_app.dependency_overrides.clear()


@pytest.fixture
def setup_trades_and_candles(integration_db):
    """
    結合テスト用のシミュレーション・売買履歴・ローソク足データを作成

    構成:
    - シミュレーション1件（status='stopped'）
    - 売買履歴3件（短い期間に集中）
    - M10ローソク足100本
    - H1ローソク足100本
    - D1ローソク足100本
    - W1ローソク足100本
    """
    db = integration_db

    # シミュレーション作成
    sim_id = uuid.uuid4()
    simulation = Simulation(
        id=sim_id,
        start_time=datetime(2024, 1, 15, 7, 0, 0),
        current_time=datetime(2024, 1, 15, 23, 0, 0),
        speed=Decimal("1.0"),
        status="stopped"
    )
    db.add(simulation)
    db.flush()

    # 口座作成
    account = Account(
        id=uuid.uuid4(),
        simulation_id=sim_id,
        initial_balance=Decimal("1000000"),
        balance=Decimal("1005000"),
        equity=Decimal("1005000"),
        realized_pnl=Decimal("5000"),
        consecutive_losses=0
    )
    db.add(account)
    db.flush()

    # 売買履歴3件作成（短い期間に集中: 21:00～22:30）
    trade_times = [
        (datetime(2024, 1, 15, 21, 0, 0), datetime(2024, 1, 15, 21, 30, 0)),
        (datetime(2024, 1, 15, 21, 40, 0), datetime(2024, 1, 15, 22, 0, 0)),
        (datetime(2024, 1, 15, 22, 10, 0), datetime(2024, 1, 15, 22, 30, 0)),
    ]

    for i, (opened_at, closed_at) in enumerate(trade_times):
        order_id = uuid.uuid4()
        position_id = uuid.uuid4()

        order = Order(
            id=order_id,
            simulation_id=sim_id,
            side="buy" if i % 2 == 0 else "sell",
            lot_size=Decimal("0.10"),
            entry_price=Decimal("150.000") + Decimal(str(i * 0.1)),
            executed_at=opened_at,
        )
        db.add(order)
        db.flush()

        position = Position(
            id=position_id,
            simulation_id=sim_id,
            order_id=order_id,
            side="buy" if i % 2 == 0 else "sell",
            lot_size=Decimal("0.10"),
            entry_price=Decimal("150.000") + Decimal(str(i * 0.1)),
            status="closed",
            opened_at=opened_at,
            closed_at=closed_at,
        )
        db.add(position)
        db.flush()

        trade = Trade(
            id=uuid.uuid4(),
            simulation_id=sim_id,
            position_id=position_id,
            side="buy" if i % 2 == 0 else "sell",
            lot_size=Decimal("0.10"),
            entry_price=Decimal("150.000") + Decimal(str(i * 0.1)),
            exit_price=Decimal("150.200") + Decimal(str(i * 0.1)),
            realized_pnl=Decimal("2000") if i % 2 == 0 else Decimal("-1000"),
            realized_pnl_pips=Decimal("20.0") if i % 2 == 0 else Decimal("-10.0"),
            opened_at=opened_at,
            closed_at=closed_at,
        )
        db.add(trade)

    # ローソク足データ作成
    # 売買履歴は21:00～22:30 (Jan 15)なので、各時間足で80本以上が
    # end_time(22:30)より前に存在するよう開始日を十分に前に設定する
    candle_id = 1

    # M10: 100本 (Jan 15 7:00～23:30) - 売買前に84本(7:00～20:50)
    base_m10 = datetime(2024, 1, 15, 7, 0, 0)
    for i in range(100):
        candle = Candle(
            id=candle_id,
            timeframe="M10",
            timestamp=base_m10 + timedelta(minutes=i * 10),
            open=Decimal("150.00") + Decimal(str(i * 0.01)),
            high=Decimal("150.10") + Decimal(str(i * 0.01)),
            low=Decimal("149.90") + Decimal(str(i * 0.01)),
            close=Decimal("150.05") + Decimal(str(i * 0.01)),
            volume=1000 + i * 100
        )
        candle_id += 1
        db.add(candle)

    # H1: 100本 (Jan 11 Thu 7:00～ Jan 15 Mon 10:00あたり)
    # Jan 11(Thu)～Jan 15(Mon)で土日除外後も80本以上確保
    # 実際にはfilter_market_hoursで土曜7:00以降と日曜が除外される
    # Thu 7:00から100時間 = Mon 11:00。土日除外で約80本残る
    base_h1 = datetime(2024, 1, 8, 7, 0, 0)  # 月曜7:00から開始
    for i in range(200):  # 多めに作成（市場時間フィルタで減るため）
        ts = base_h1 + timedelta(hours=i)
        candle = Candle(
            id=candle_id,
            timeframe="H1",
            timestamp=ts,
            open=Decimal("150.00") + Decimal(str(i * 0.02)),
            high=Decimal("150.20") + Decimal(str(i * 0.02)),
            low=Decimal("149.80") + Decimal(str(i * 0.02)),
            close=Decimal("150.10") + Decimal(str(i * 0.02)),
            volume=5000 + i * 100
        )
        candle_id += 1
        db.add(candle)

    # D1: 100本 (Oct 8, 2023～ Jan 15, 2024) - 売買日(Jan 15)前に99本
    base_d1 = datetime(2023, 10, 8, 7, 0, 0)
    for i in range(100):
        candle = Candle(
            id=candle_id,
            timeframe="D1",
            timestamp=base_d1 + timedelta(days=i),
            open=Decimal("150.00") + Decimal(str(i * 0.05)),
            high=Decimal("150.50") + Decimal(str(i * 0.05)),
            low=Decimal("149.50") + Decimal(str(i * 0.05)),
            close=Decimal("150.25") + Decimal(str(i * 0.05)),
            volume=10000 + i * 100
        )
        candle_id += 1
        db.add(candle)

    # W1: 100本 (Jun 2022～ Jan 2024) - 売買日前に80週以上
    base_w1 = datetime(2022, 6, 6, 7, 0, 0)  # 月曜7:00
    for i in range(100):
        candle = Candle(
            id=candle_id,
            timeframe="W1",
            timestamp=base_w1 + timedelta(weeks=i),
            open=Decimal("150.00") + Decimal(str(i * 0.10)),
            high=Decimal("151.00") + Decimal(str(i * 0.10)),
            low=Decimal("149.00") + Decimal(str(i * 0.10)),
            close=Decimal("150.50") + Decimal(str(i * 0.10)),
            volume=50000 + i * 100
        )
        candle_id += 1
        db.add(candle)

    db.commit()
    return {"simulation_id": sim_id, "trade_count": 3}


class TestTradesWithCandlesAPI:
    """/api/v1/analytics/trades-with-candles エンドポイントの結合テスト"""

    def test_response_structure(self, client, setup_trades_and_candles):
        """
        レスポンスの基本構造が正しいこと
        - success: True
        - data.trades: 売買履歴リスト
        - data.candles: ローソク足リスト
        - data.timeframe: 時間足
        - data.start_time, data.end_time: 時間範囲
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        assert response.status_code == 200

        body = response.json()
        assert body["success"] is True
        assert "data" in body

        data = body["data"]
        assert "trades" in data
        assert "candles" in data
        assert "timeframe" in data
        assert "start_time" in data
        assert "end_time" in data
        assert data["timeframe"] == "M10"

    def test_trades_returned_correctly(self, client, setup_trades_and_candles):
        """
        売買履歴が正しく返却されること
        - 3件のトレードが含まれる
        - 各トレードに必要なフィールドがある
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        trades = data["trades"]
        assert len(trades) == 3

        # 各トレードの構造を確認
        for trade in trades:
            assert "trade_id" in trade
            assert "side" in trade
            assert "lot_size" in trade
            assert "entry_price" in trade
            assert "exit_price" in trade
            assert "realized_pnl" in trade
            assert "realized_pnl_pips" in trade
            assert "opened_at" in trade
            assert "closed_at" in trade
            assert trade["side"] in ("buy", "sell")

    def test_m10_minimum_80_candles(self, client, setup_trades_and_candles):
        """
        M10時間足で最低80本のローソク足が返却されること
        （売買履歴は21:00～22:30の狭い範囲だが、80本以上返る）
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 80, f"M10: Expected >= 80 candles, got {len(candles)}"

    def test_h1_minimum_80_candles(self, client, setup_trades_and_candles):
        """
        H1時間足で最低80本のローソク足が返却されること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=H1")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 80, f"H1: Expected >= 80 candles, got {len(candles)}"

    def test_d1_minimum_80_candles(self, client, setup_trades_and_candles):
        """
        D1時間足で最低80本のローソク足が返却されること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=D1")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 80, f"D1: Expected >= 80 candles, got {len(candles)}"

    def test_w1_minimum_80_candles(self, client, setup_trades_and_candles):
        """
        W1時間足で最低80本のローソク足が返却されること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=W1")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 80, f"W1: Expected >= 80 candles, got {len(candles)}"

    def test_candle_structure(self, client, setup_trades_and_candles):
        """
        ローソク足データの構造が正しいこと
        - timestamp, open, high, low, close, volume が含まれる
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) > 0

        candle = candles[0]
        assert "timestamp" in candle
        assert "open" in candle
        assert "high" in candle
        assert "low" in candle
        assert "close" in candle
        assert "volume" in candle

    def test_ema_included_in_candles(self, client, setup_trades_and_candles):
        """
        ローソク足データにEMA(ema20)が含まれること
        - 最初の19本はNone
        - 20本目以降は数値
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 20

        # 最初の19本はema20がNone
        for i in range(min(19, len(candles))):
            assert candles[i].get("ema20") is None, f"candle[{i}] should have ema20=None"

        # 20本目以降はema20が数値
        assert candles[19].get("ema20") is not None, "candle[19] should have ema20 value"
        assert isinstance(candles[19]["ema20"], (int, float)), "ema20 should be a number"

    def test_candles_sorted_chronologically(self, client, setup_trades_and_candles):
        """
        ローソク足が時系列順（昇順）でソートされていること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        candles = data["candles"]
        timestamps = [c["timestamp"] for c in candles]

        for i in range(1, len(timestamps)):
            assert timestamps[i] >= timestamps[i - 1], \
                f"Candles not sorted: {timestamps[i-1]} > {timestamps[i]}"

    def test_trade_range_included_in_candles(self, client, setup_trades_and_candles):
        """
        売買履歴の時間範囲内のローソク足が結果に含まれること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        # 売買範囲: 21:00～22:30
        candle_timestamps = [c["timestamp"] for c in data["candles"]]
        trade_start = "2024-01-15T21:00:00"
        trade_end = "2024-01-15T22:30:00"

        has_trade_period = any(
            trade_start <= ts <= trade_end for ts in candle_timestamps
        )
        assert has_trade_period, "Trade period candles should be included"

    def test_custom_min_candles(self, client, setup_trades_and_candles):
        """
        min_candlesパラメータで最低本数をカスタマイズできること
        """
        response = client.get(
            "/api/v1/analytics/trades-with-candles?timeframe=M10&min_candles=50"
        )
        data = response.json()["data"]

        candles = data["candles"]
        assert len(candles) >= 50, f"Expected >= 50 candles, got {len(candles)}"

    def test_no_trades_returns_empty(self, client, integration_db):
        """
        売買履歴がない場合は空のデータを返すこと
        """
        # シミュレーションのみ作成（トレードなし）
        sim_id = uuid.uuid4()
        simulation = Simulation(
            id=sim_id,
            start_time=datetime(2024, 1, 15, 7, 0, 0),
            current_time=datetime(2024, 1, 15, 23, 0, 0),
            speed=Decimal("1.0"),
            status="stopped"
        )
        integration_db.add(simulation)
        account = Account(
            id=uuid.uuid4(),
            simulation_id=sim_id,
            initial_balance=Decimal("1000000"),
            balance=Decimal("1000000"),
            equity=Decimal("1000000"),
            realized_pnl=Decimal("0"),
            consecutive_losses=0
        )
        integration_db.add(account)
        integration_db.commit()

        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        assert response.status_code == 200

        data = response.json()["data"]
        assert data["trades"] == []
        assert data["candles"] == []
        assert data["start_time"] is None
        assert data["end_time"] is None

    def test_invalid_timeframe_returns_422(self, client, setup_trades_and_candles):
        """
        無効な時間足を指定した場合は422エラーが返ること
        """
        response = client.get(
            "/api/v1/analytics/trades-with-candles?timeframe=INVALID"
        )
        assert response.status_code == 422

    def test_min_candles_validation(self, client, setup_trades_and_candles):
        """
        min_candlesのバリデーション
        - 0以下は422エラー
        - 1001以上は422エラー
        """
        response = client.get(
            "/api/v1/analytics/trades-with-candles?timeframe=M10&min_candles=0"
        )
        assert response.status_code == 422

        response = client.get(
            "/api/v1/analytics/trades-with-candles?timeframe=M10&min_candles=1001"
        )
        assert response.status_code == 422

    def test_default_timeframe_is_h1(self, client, setup_trades_and_candles):
        """
        timeframeのデフォルト値はH1であること
        """
        response = client.get("/api/v1/analytics/trades-with-candles")
        data = response.json()["data"]
        assert data["timeframe"] == "H1"

    def test_start_end_time_matches_trades(self, client, setup_trades_and_candles):
        """
        start_timeとend_timeが売買履歴の範囲と一致すること
        """
        response = client.get("/api/v1/analytics/trades-with-candles?timeframe=M10")
        data = response.json()["data"]

        # 最初のトレード開始: 2024-01-15T21:00:00
        # 最後のトレード終了: 2024-01-15T22:30:00
        assert data["start_time"] is not None
        assert data["end_time"] is not None
        assert "2024-01-15T21:00:00" in data["start_time"]
        assert "2024-01-15T22:30:00" in data["end_time"]
