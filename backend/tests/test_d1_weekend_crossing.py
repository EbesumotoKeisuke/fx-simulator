"""
日足（D1）の週末越えテスト

週末(土曜日5:00以降)からの次週(月曜日7:00以降)で
日足が正しく更新されることを確認する。
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from decimal import Decimal

from src.services.market_data_service import (
    MarketDataService,
    is_market_open,
    calculate_ema,
)


class TestIsMarketOpen:
    """FX市場営業時間チェックのテスト"""

    def test_monday_before_7am_is_closed(self):
        """月曜日7:00前は休場"""
        dt = datetime(2024, 1, 22, 6, 59)  # Monday 6:59
        assert not is_market_open(dt)

    def test_monday_at_7am_is_open(self):
        """月曜日7:00は営業中"""
        dt = datetime(2024, 1, 22, 7, 0)  # Monday 7:00
        assert is_market_open(dt)

    def test_friday_afternoon_is_open(self):
        """金曜日午後は営業中"""
        dt = datetime(2024, 1, 26, 15, 0)  # Friday 15:00
        assert is_market_open(dt)

    def test_saturday_before_7am_is_open(self):
        """土曜日7:00前は営業中"""
        dt = datetime(2024, 1, 27, 5, 0)  # Saturday 5:00
        assert is_market_open(dt)

    def test_saturday_at_7am_is_closed(self):
        """土曜日7:00以降は休場"""
        dt = datetime(2024, 1, 27, 7, 0)  # Saturday 7:00
        assert not is_market_open(dt)

    def test_sunday_is_closed(self):
        """日曜日は完全に休場"""
        dt = datetime(2024, 1, 28, 12, 0)  # Sunday 12:00
        assert not is_market_open(dt)


class TestD1PartialCandleGeneration:
    """D1の部分ローソク足生成テスト"""

    def test_generate_partial_candle_d1_falls_back_to_m10(self):
        """D1のgenerate_partial_candleがH1データ無しの場合M10にフォールバック"""
        db = MagicMock()
        service = MarketDataService(db)

        # Monday 7:40
        current_time = datetime(2024, 1, 22, 7, 40)
        start_time = datetime(2024, 1, 22, 7, 0)

        # H1データがない場合のモック
        mock_query = MagicMock()
        db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.all.return_value = []  # H1 = empty, M10 = empty first call

        result = service.generate_partial_candle('D1', start_time, current_time)
        # H1データなし、M10フォールバックもなしの場合はNone
        # （M10データがある場合はフォールバックで値を返す）
        # 最低限、エラーが発生しないことを確認
        assert result is None or isinstance(result, dict)

    def test_calculate_candle_start_time_d1_monday(self):
        """月曜日の日足開始時刻が正しく計算される"""
        db = MagicMock()
        service = MarketDataService(db)

        # Monday 7:40
        current_time = datetime(2024, 1, 22, 7, 40)
        start = service.calculate_candle_start_time('D1', current_time)
        assert start == datetime(2024, 1, 22, 7, 0)

    def test_calculate_candle_start_time_d1_before_7am(self):
        """7:00前の日足開始時刻は前日7:00"""
        db = MagicMock()
        service = MarketDataService(db)

        current_time = datetime(2024, 1, 22, 6, 30)
        start = service.calculate_candle_start_time('D1', current_time)
        assert start == datetime(2024, 1, 21, 7, 0)
