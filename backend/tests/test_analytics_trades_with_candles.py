"""
売買履歴チャートの最低ローソク足本数テスト

パフォーマンス分析画面の売買履歴チャートで、
売買履歴が少なくても最低80本のローソク足を表示する機能のテスト。
"""

import pytest
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from src.models.candle import Candle
from src.models.simulation import Simulation
from src.models.account import Account
from src.models.position import Position
from src.models.trade import Trade
from src.services.market_data_service import MarketDataService


class TestGetCandlesWithMinimum:
    """最低ローソク足本数を保証する機能のテスト"""

    @pytest.fixture
    def market_service(self, test_db):
        """MarketDataServiceインスタンスを作成"""
        return MarketDataService(test_db)

    @pytest.fixture
    def many_candles(self, test_db):
        """100本のローソク足データを作成（各時間足用）"""
        candles = []
        base_time = datetime(2024, 1, 15, 7, 0, 0)  # 月曜日7:00から
        candle_id = 1

        # M10（10分足）: 100本作成（7:00～23:30）
        for i in range(100):
            candle = Candle(
                id=candle_id,
                timeframe="M10",
                timestamp=base_time + timedelta(minutes=i * 10),
                open=Decimal("150.00") + Decimal(str(i * 0.01)),
                high=Decimal("150.10") + Decimal(str(i * 0.01)),
                low=Decimal("149.90") + Decimal(str(i * 0.01)),
                close=Decimal("150.05") + Decimal(str(i * 0.01)),
                volume=1000 + i * 100
            )
            candle_id += 1
            candles.append(candle)
            test_db.add(candle)

        # H1（1時間足）: 100本作成（Mon 7:00～Fri 11:00）
        for i in range(100):
            candle = Candle(
                id=candle_id,
                timeframe="H1",
                timestamp=base_time + timedelta(hours=i),
                open=Decimal("150.00") + Decimal(str(i * 0.02)),
                high=Decimal("150.20") + Decimal(str(i * 0.02)),
                low=Decimal("149.80") + Decimal(str(i * 0.02)),
                close=Decimal("150.10") + Decimal(str(i * 0.02)),
                volume=5000 + i * 100
            )
            candle_id += 1
            candles.append(candle)
            test_db.add(candle)

        # D1（日足）: 100本作成（100日分）
        for i in range(100):
            candle = Candle(
                id=candle_id,
                timeframe="D1",
                timestamp=base_time + timedelta(days=i),
                open=Decimal("150.00") + Decimal(str(i * 0.05)),
                high=Decimal("150.50") + Decimal(str(i * 0.05)),
                low=Decimal("149.50") + Decimal(str(i * 0.05)),
                close=Decimal("150.25") + Decimal(str(i * 0.05)),
                volume=10000 + i * 100
            )
            candle_id += 1
            candles.append(candle)
            test_db.add(candle)

        # W1（週足）: 100本作成（100週分）
        for i in range(100):
            candle = Candle(
                id=candle_id,
                timeframe="W1",
                timestamp=base_time + timedelta(weeks=i),
                open=Decimal("150.00") + Decimal(str(i * 0.10)),
                high=Decimal("151.00") + Decimal(str(i * 0.10)),
                low=Decimal("149.00") + Decimal(str(i * 0.10)),
                close=Decimal("150.50") + Decimal(str(i * 0.10)),
                volume=50000 + i * 100
            )
            candle_id += 1
            candles.append(candle)
            test_db.add(candle)

        test_db.commit()
        return candles

    def test_get_candles_with_minimum_returns_at_least_min_candles(
        self, market_service, many_candles
    ):
        """
        min_candlesパラメータで指定した本数以上のローソク足が返却される
        （売買範囲が狭くても過去データを含めて80本以上返す）
        """
        # 狭い売買範囲をデータの後半に設定（前方に80本以上のデータあり）
        # M10: 7:00開始、90本目=7:00+900min=22:00、95本目=22:50
        start_time = datetime(2024, 1, 15, 22, 0, 0)
        end_time = datetime(2024, 1, 15, 23, 30, 0)  # 10本分の狭い範囲

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        # 80本以上のローソク足が返却されること
        assert len(result) >= 80

    def test_get_candles_with_minimum_includes_trade_range(
        self, market_service, many_candles
    ):
        """
        売買履歴の時間範囲内のローソク足が含まれること
        """
        start_time = datetime(2024, 1, 15, 22, 0, 0)
        end_time = datetime(2024, 1, 15, 23, 30, 0)

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        # 売買履歴の時間範囲内のローソク足が含まれていること
        timestamps = [c['timestamp'] for c in result]
        has_trade_period = any(
            start_time.isoformat() <= ts <= end_time.isoformat()
            for ts in timestamps
        )
        assert has_trade_period

    def test_get_candles_with_minimum_h1_timeframe(
        self, market_service, many_candles
    ):
        """
        H1時間足でも最低80本が返却される
        """
        # H1: 100本、Mon 7:00～Fri 11:00（100時間）
        # 85本目=7:00+85h=Jan 18 20:00
        start_time = datetime(2024, 1, 18, 20, 0, 0)
        end_time = datetime(2024, 1, 19, 3, 0, 0)  # 7本分の狭い範囲

        result = market_service.get_candles_with_minimum(
            timeframe="H1",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        assert len(result) >= 80

    def test_get_candles_with_minimum_d1_timeframe(
        self, market_service, many_candles
    ):
        """
        D1時間足でも最低80本が返却される
        """
        # D1: 100本、Jan 15～Apr 23（100日間）
        # 85本目=Jan 15 + 85日=Apr 9
        start_time = datetime(2024, 4, 9, 7, 0, 0)
        end_time = datetime(2024, 4, 12, 7, 0, 0)  # 3日分の狭い範囲

        result = market_service.get_candles_with_minimum(
            timeframe="D1",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        assert len(result) >= 80

    def test_get_candles_with_minimum_w1_timeframe(
        self, market_service, many_candles
    ):
        """
        W1時間足でも最低80本が返却される
        """
        # W1: 100本、Jan 15 + 100週
        # 85本目=Jan 15 + 85週=Sep 2025頃
        start_time = datetime(2025, 9, 1, 7, 0, 0)
        end_time = datetime(2025, 9, 15, 7, 0, 0)  # 2週間分の狭い範囲

        result = market_service.get_candles_with_minimum(
            timeframe="W1",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        assert len(result) >= 80

    def test_get_candles_with_minimum_returns_enough_when_range_has_enough(
        self, market_service, many_candles
    ):
        """
        時間範囲内に十分なローソク足がある場合はその範囲のデータを返却
        """
        # 広い時間範囲（100本分のM10）
        start_time = datetime(2024, 1, 15, 7, 0, 0)
        end_time = datetime(2024, 1, 15, 23, 30, 0)  # 16.5時間 = 99本

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        # 80本以上あること
        assert len(result) >= 80

    def test_get_candles_with_minimum_extends_to_past(
        self, market_service, many_candles
    ):
        """
        ローソク足が足りない場合、過去方向に範囲を拡張して取得し、
        最新のローソク足はend_time以前であること
        """
        start_time = datetime(2024, 1, 15, 22, 0, 0)
        end_time = datetime(2024, 1, 15, 23, 30, 0)

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        # 最新のローソク足はend_time以前であること
        if result:
            latest_ts = result[-1]['timestamp']
            assert latest_ts <= end_time.isoformat()

    def test_get_candles_with_minimum_default_min_candles(
        self, market_service, many_candles
    ):
        """
        min_candlesパラメータのデフォルト値は80
        """
        # データの後半に売買範囲を設定
        start_time = datetime(2024, 1, 15, 22, 0, 0)
        end_time = datetime(2024, 1, 15, 23, 0, 0)  # 7本分

        # min_candlesを指定しない場合
        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time
        )

        # デフォルトで80本以上
        assert len(result) >= 80

    def test_get_candles_with_minimum_handles_no_data(
        self, market_service, test_db
    ):
        """
        データがない場合は空リストを返す
        """
        start_time = datetime(2025, 1, 15, 8, 0, 0)
        end_time = datetime(2025, 1, 15, 9, 0, 0)

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        assert result == []

    def test_get_candles_with_minimum_few_data_returns_all_available(
        self, market_service, test_db
    ):
        """
        データが80本未満しかない場合は取得可能な全データを返す
        """
        base_time = datetime(2024, 6, 3, 7, 0, 0)  # 月曜日
        # 30本のみ作成
        for i in range(30):
            candle = Candle(
                id=10000 + i,
                timeframe="M10",
                timestamp=base_time + timedelta(minutes=i * 10),
                open=Decimal("150.00"),
                high=Decimal("150.10"),
                low=Decimal("149.90"),
                close=Decimal("150.05"),
                volume=1000
            )
            test_db.add(candle)
        test_db.commit()

        start_time = datetime(2024, 6, 3, 10, 0, 0)
        end_time = datetime(2024, 6, 3, 12, 0, 0)  # 全30本(7:00～11:50)を含む範囲

        result = market_service.get_candles_with_minimum(
            timeframe="M10",
            start_time=start_time,
            end_time=end_time,
            min_candles=80
        )

        # 30本全てが返却される（80本未満だが取得可能な最大数）
        assert len(result) == 30
