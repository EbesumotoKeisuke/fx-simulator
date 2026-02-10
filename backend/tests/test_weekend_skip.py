"""
週末スキップ機能のユニットテスト

市場営業時間外（週末）のデータスキップ処理をテストする。
"""

import pytest
from datetime import datetime, timedelta

from src.services.market_data_service import is_market_open


class TestWeekendSkipLogic:
    """週末スキップロジックのテスト"""

    def test_saturday_before_7am_is_open(self):
        """土曜日7:00前は市場オープン"""
        saturday_6am = datetime(2024, 1, 20, 6, 50, 0)  # 土曜日6:50

        assert is_market_open(saturday_6am) is True

    def test_saturday_at_7am_is_closed(self):
        """土曜日7:00ちょうどは市場クローズ"""
        saturday_7am = datetime(2024, 1, 20, 7, 0, 0)  # 土曜日7:00

        assert is_market_open(saturday_7am) is False

    def test_saturday_after_7am_is_closed(self):
        """土曜日7:00以降は市場クローズ"""
        saturday_8am = datetime(2024, 1, 20, 8, 0, 0)  # 土曜日8:00

        assert is_market_open(saturday_8am) is False

    def test_sunday_is_closed(self):
        """日曜日は終日市場クローズ"""
        sunday_noon = datetime(2024, 1, 21, 12, 0, 0)  # 日曜日12:00

        assert is_market_open(sunday_noon) is False

    def test_monday_before_7am_is_closed(self):
        """月曜日7:00前は市場クローズ"""
        monday_6am = datetime(2024, 1, 22, 6, 0, 0)  # 月曜日6:00

        assert is_market_open(monday_6am) is False

    def test_monday_at_7am_is_open(self):
        """月曜日7:00ちょうどは市場オープン"""
        monday_7am = datetime(2024, 1, 22, 7, 0, 0)  # 月曜日7:00

        assert is_market_open(monday_7am) is True

    def test_monday_after_7am_is_open(self):
        """月曜日7:00以降は市場オープン"""
        monday_8am = datetime(2024, 1, 22, 8, 0, 0)  # 月曜日8:00

        assert is_market_open(monday_8am) is True


class TestWeekendTransition:
    """週末遷移のテスト"""

    def test_saturday_to_monday_transition(self):
        """土曜日6:50から月曜日7:00への遷移"""
        saturday_650 = datetime(2024, 1, 20, 6, 50, 0)  # 土曜日6:50
        monday_700 = datetime(2024, 1, 22, 7, 0, 0)  # 月曜日7:00

        # 土曜日6:50は市場オープン
        assert is_market_open(saturday_650) is True

        # 次の10分足は土曜日7:00（市場クローズ）
        next_candle = saturday_650 + timedelta(minutes=10)
        assert is_market_open(next_candle) is False

        # スキップ先は月曜日7:00
        assert is_market_open(monday_700) is True

    def test_friday_to_monday_transition(self):
        """金曜日23:50から月曜日7:00への遷移（夜またぎ）"""
        # 金曜日は終日オープン
        friday_2350 = datetime(2024, 1, 19, 23, 50, 0)  # 金曜日23:50
        assert is_market_open(friday_2350) is True

        # 土曜日0:00も7:00まではオープン
        saturday_000 = datetime(2024, 1, 20, 0, 0, 0)
        assert is_market_open(saturday_000) is True


class TestNextMarketOpenCalculation:
    """次の市場オープン時刻計算のテスト"""

    def test_calculate_next_monday_7am_from_saturday(self):
        """土曜日から次の月曜日7:00を計算"""
        saturday = datetime(2024, 1, 20, 8, 0, 0)  # 土曜日8:00

        # 次の月曜日7:00を計算
        days_until_monday = (7 - saturday.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7  # 月曜日から月曜日の場合は1週間後

        next_monday = saturday + timedelta(days=days_until_monday)
        next_monday_7am = next_monday.replace(hour=7, minute=0, second=0, microsecond=0)

        assert next_monday_7am.weekday() == 0  # 月曜日
        assert next_monday_7am.hour == 7
        assert next_monday_7am.minute == 0

    def test_calculate_next_monday_7am_from_sunday(self):
        """日曜日から次の月曜日7:00を計算"""
        sunday = datetime(2024, 1, 21, 12, 0, 0)  # 日曜日12:00

        # 次の月曜日7:00を計算
        days_until_monday = (7 - sunday.weekday()) % 7
        if days_until_monday == 0:
            days_until_monday = 7

        next_monday = sunday + timedelta(days=days_until_monday)
        next_monday_7am = next_monday.replace(hour=7, minute=0, second=0, microsecond=0)

        assert next_monday_7am.weekday() == 0  # 月曜日
        assert next_monday_7am.date() == datetime(2024, 1, 22).date()


class TestMarketHoursEdgeCases:
    """市場営業時間の境界条件テスト"""

    def test_weekday_noon(self):
        """平日昼間は市場オープン"""
        wednesday_noon = datetime(2024, 1, 17, 12, 0, 0)  # 水曜日12:00

        assert is_market_open(wednesday_noon) is True

    def test_weekday_midnight(self):
        """平日深夜も市場オープン"""
        thursday_2am = datetime(2024, 1, 18, 2, 0, 0)  # 木曜日2:00

        assert is_market_open(thursday_2am) is True

    def test_friday_night(self):
        """金曜日夜は市場オープン"""
        friday_2300 = datetime(2024, 1, 19, 23, 0, 0)  # 金曜日23:00

        assert is_market_open(friday_2300) is True

    def test_saturday_early_morning(self):
        """土曜日早朝（7:00前）は市場オープン"""
        saturday_300 = datetime(2024, 1, 20, 3, 0, 0)  # 土曜日3:00

        assert is_market_open(saturday_300) is True


class TestAdvanceTimeWithWeekendSkip:
    """時刻進行時の週末スキップテスト"""

    def test_advance_time_should_check_market_open(self):
        """時刻進行時は市場オープンをチェックすべき"""
        current_time = datetime(2024, 1, 20, 6, 50, 0)  # 土曜日6:50
        advance_minutes = 10

        new_time = current_time + timedelta(minutes=advance_minutes)

        # 新しい時刻が市場クローズかチェック
        if not is_market_open(new_time):
            # 次の市場オープン時刻を探す必要がある
            pass

        assert is_market_open(current_time) is True
        assert is_market_open(new_time) is False

    def test_continuous_advance_through_weekend(self):
        """週末を跨いだ連続進行"""
        times = [
            datetime(2024, 1, 20, 6, 40, 0),  # 土曜日6:40 - オープン
            datetime(2024, 1, 20, 6, 50, 0),  # 土曜日6:50 - オープン
            datetime(2024, 1, 20, 7, 0, 0),   # 土曜日7:00 - クローズ
            datetime(2024, 1, 20, 12, 0, 0),  # 土曜日12:00 - クローズ
            datetime(2024, 1, 21, 12, 0, 0),  # 日曜日12:00 - クローズ
            datetime(2024, 1, 22, 6, 0, 0),   # 月曜日6:00 - クローズ
            datetime(2024, 1, 22, 7, 0, 0),   # 月曜日7:00 - オープン
        ]

        expected = [True, True, False, False, False, False, True]

        for time, exp in zip(times, expected):
            assert is_market_open(time) is exp, f"Failed for {time}: expected {exp}"
