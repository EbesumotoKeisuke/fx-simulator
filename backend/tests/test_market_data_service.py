"""
市場データサービスのユニットテスト

is_market_open関数とfilter_market_hours関数のテストを行う。
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock

from src.services.market_data_service import is_market_open, filter_market_hours


class TestIsMarketOpen:
    """is_market_open関数のテスト"""

    def test_sunday_is_closed(self):
        """日曜日は終日休場"""
        # 2024年1月14日は日曜日
        sunday_morning = datetime(2024, 1, 14, 9, 0, 0)
        sunday_night = datetime(2024, 1, 14, 23, 0, 0)

        assert is_market_open(sunday_morning) is False
        assert is_market_open(sunday_night) is False

    def test_saturday_before_7am_is_open(self):
        """土曜日7:00より前は営業"""
        # 2024年1月13日は土曜日
        saturday_6am = datetime(2024, 1, 13, 6, 0, 0)
        saturday_659 = datetime(2024, 1, 13, 6, 59, 0)

        assert is_market_open(saturday_6am) is True
        assert is_market_open(saturday_659) is True

    def test_saturday_after_7am_is_closed(self):
        """土曜日7:00以降は休場"""
        # 2024年1月13日は土曜日
        saturday_7am = datetime(2024, 1, 13, 7, 0, 0)
        saturday_noon = datetime(2024, 1, 13, 12, 0, 0)

        assert is_market_open(saturday_7am) is False
        assert is_market_open(saturday_noon) is False

    def test_monday_before_7am_is_closed(self):
        """月曜日7:00より前は休場"""
        # 2024年1月15日は月曜日
        monday_6am = datetime(2024, 1, 15, 6, 0, 0)
        monday_659 = datetime(2024, 1, 15, 6, 59, 0)

        assert is_market_open(monday_6am) is False
        assert is_market_open(monday_659) is False

    def test_monday_after_7am_is_open(self):
        """月曜日7:00以降は営業"""
        # 2024年1月15日は月曜日
        monday_7am = datetime(2024, 1, 15, 7, 0, 0)
        monday_noon = datetime(2024, 1, 15, 12, 0, 0)

        assert is_market_open(monday_7am) is True
        assert is_market_open(monday_noon) is True

    def test_weekday_is_open(self):
        """平日（火〜金）は終日営業"""
        # 2024年1月16日は火曜日
        tuesday = datetime(2024, 1, 16, 12, 0, 0)
        # 2024年1月17日は水曜日
        wednesday = datetime(2024, 1, 17, 3, 0, 0)
        # 2024年1月18日は木曜日
        thursday = datetime(2024, 1, 18, 23, 59, 0)
        # 2024年1月19日は金曜日
        friday = datetime(2024, 1, 19, 0, 0, 0)

        assert is_market_open(tuesday) is True
        assert is_market_open(wednesday) is True
        assert is_market_open(thursday) is True
        assert is_market_open(friday) is True


class TestFilterMarketHours:
    """filter_market_hours関数のテスト"""

    def test_w1_timeframe_skips_filter(self):
        """週足(W1)は市場時間フィルタリングをスキップ"""
        # 日曜日のダミーCandle（本来はフィルタリングされる）
        mock_candle = MagicMock()
        mock_candle.timestamp = datetime(2024, 1, 14, 12, 0, 0)  # 日曜日

        candles = [mock_candle]
        result = filter_market_hours(candles, 'W1')

        assert len(result) == 1  # フィルタリングされない

    def test_d1_timeframe_skips_filter(self):
        """日足(D1)は市場時間フィルタリングをスキップ"""
        mock_candle = MagicMock()
        mock_candle.timestamp = datetime(2024, 1, 14, 12, 0, 0)  # 日曜日

        candles = [mock_candle]
        result = filter_market_hours(candles, 'D1')

        assert len(result) == 1  # フィルタリングされない

    def test_m10_timeframe_filters_sunday(self):
        """10分足(M10)は日曜日のデータをフィルタリング"""
        mock_sunday = MagicMock()
        mock_sunday.timestamp = datetime(2024, 1, 14, 12, 0, 0)  # 日曜日

        mock_monday = MagicMock()
        mock_monday.timestamp = datetime(2024, 1, 15, 9, 0, 0)  # 月曜日9:00

        candles = [mock_sunday, mock_monday]
        result = filter_market_hours(candles, 'M10')

        assert len(result) == 1
        assert result[0] == mock_monday

    def test_h1_timeframe_filters_saturday_after_7am(self):
        """1時間足(H1)は土曜日7:00以降のデータをフィルタリング"""
        mock_saturday_6am = MagicMock()
        mock_saturday_6am.timestamp = datetime(2024, 1, 13, 6, 0, 0)

        mock_saturday_7am = MagicMock()
        mock_saturday_7am.timestamp = datetime(2024, 1, 13, 7, 0, 0)

        candles = [mock_saturday_6am, mock_saturday_7am]
        result = filter_market_hours(candles, 'H1')

        assert len(result) == 1
        assert result[0] == mock_saturday_6am

    def test_empty_candles_returns_empty(self):
        """空のリストは空を返す"""
        result = filter_market_hours([], 'M10')
        assert result == []
