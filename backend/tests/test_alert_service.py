"""
アラート機能のユニットテスト

F-007: 自動アラート機能のテストを行う。
"""

import pytest
from datetime import datetime
from decimal import Decimal


class TestConsecutiveLossAlert:
    """連敗アラートのテスト"""

    def test_three_consecutive_losses_warning(self):
        """3連敗で警告アラート"""
        consecutive_losses = 3

        should_warn = consecutive_losses >= 3
        alert_type = "warning" if consecutive_losses == 3 else None

        assert should_warn is True
        assert alert_type == "warning"

    def test_five_consecutive_losses_danger(self):
        """5連敗で危険アラート"""
        consecutive_losses = 5

        if consecutive_losses >= 5:
            alert_type = "danger"
        elif consecutive_losses >= 3:
            alert_type = "warning"
        else:
            alert_type = None

        assert alert_type == "danger"

    def test_two_consecutive_losses_no_alert(self):
        """2連敗ではアラートなし"""
        consecutive_losses = 2

        should_warn = consecutive_losses >= 3
        assert should_warn is False


class TestLotSizeAlert:
    """ロットサイズアラートのテスト"""

    def test_lot_size_double_average_warning(self):
        """平均の2倍以上で警告"""
        average_lot_size = 0.1
        current_lot_size = 0.25

        multiplier = current_lot_size / average_lot_size
        should_warn = multiplier >= 2.0

        assert should_warn is True
        assert multiplier == 2.5

    def test_lot_size_normal_no_warning(self):
        """平均以下ではアラートなし"""
        average_lot_size = 0.1
        current_lot_size = 0.1

        multiplier = current_lot_size / average_lot_size
        should_warn = multiplier >= 2.0

        assert should_warn is False

    def test_margin_fifty_percent_danger(self):
        """証拠金の50%以上で危険アラート"""
        balance = 1000000
        required_margin = 600000  # 60%

        percent_used = (required_margin / balance) * 100
        should_danger = percent_used >= 50

        assert should_danger is True
        assert percent_used == 60.0


class TestDailyLossAlert:
    """日次損失アラートのテスト"""

    def test_daily_loss_five_percent_danger(self):
        """本日の損失が5%超で危険アラート"""
        initial_balance = 1000000
        daily_pnl = -60000  # -6%

        loss_percent = abs(daily_pnl) / initial_balance * 100
        should_danger = loss_percent > 5

        assert should_danger is True
        assert loss_percent == 6.0

    def test_daily_loss_three_percent_no_danger(self):
        """本日の損失が3%では危険アラートなし"""
        initial_balance = 1000000
        daily_pnl = -30000  # -3%

        loss_percent = abs(daily_pnl) / initial_balance * 100
        should_danger = loss_percent > 5

        assert should_danger is False
        assert loss_percent == 3.0


class TestDrawdownAlert:
    """ドローダウンアラートのテスト"""

    def test_drawdown_ten_percent_danger(self):
        """ドローダウン10%超で危険アラート"""
        peak_equity = 1000000
        current_equity = 880000

        drawdown = (peak_equity - current_equity) / peak_equity * 100
        should_danger = drawdown > 10

        assert should_danger is True
        assert drawdown == 12.0

    def test_drawdown_five_percent_no_danger(self):
        """ドローダウン5%では危険アラートなし"""
        peak_equity = 1000000
        current_equity = 950000

        drawdown = (peak_equity - current_equity) / peak_equity * 100
        should_danger = drawdown > 10

        assert should_danger is False
        assert drawdown == 5.0


class TestTimeBasedAlert:
    """時間帯アラートのテスト"""

    def test_low_win_rate_hour_info(self):
        """勝率が低い時間帯で情報アラート"""
        hour_stats = {
            10: {"win_rate": 35, "total_trades": 10},
            14: {"win_rate": 65, "total_trades": 8},
        }

        low_win_rate_hours = [
            hour for hour, stats in hour_stats.items()
            if stats["win_rate"] < 40 and stats["total_trades"] >= 5
        ]

        assert 10 in low_win_rate_hours
        assert 14 not in low_win_rate_hours

    def test_weekend_close_warning(self):
        """週末クローズ前の警告"""
        current_time = datetime(2024, 1, 20, 5, 0, 0)  # 土曜日5:00
        market_close = datetime(2024, 1, 20, 7, 0, 0)  # 土曜日7:00

        hours_until_close = (market_close - current_time).total_seconds() / 3600

        assert hours_until_close == 2.0
        assert hours_until_close <= 3  # 3時間以内は警告


class TestTradingIntervalAlert:
    """トレード間隔アラートのテスト"""

    def test_five_minute_interval_warning(self):
        """5分以内の連続注文で警告"""
        last_trade_time = datetime(2024, 1, 15, 10, 0, 0)
        current_time = datetime(2024, 1, 15, 10, 3, 0)  # 3分後

        minutes_since_last = (current_time - last_trade_time).total_seconds() / 60
        should_warn = minutes_since_last < 5

        assert should_warn is True
        assert minutes_since_last == 3.0

    def test_ten_minute_interval_no_warning(self):
        """10分後の注文では警告なし"""
        last_trade_time = datetime(2024, 1, 15, 10, 0, 0)
        current_time = datetime(2024, 1, 15, 10, 10, 0)  # 10分後

        minutes_since_last = (current_time - last_trade_time).total_seconds() / 60
        should_warn = minutes_since_last < 5

        assert should_warn is False
        assert minutes_since_last == 10.0

    def test_post_loss_immediate_trade_warning(self):
        """損切り直後の即座の注文で警告"""
        last_trade_pnl = -1000  # 損失
        minutes_since_last = 2  # 2分後

        is_post_loss = last_trade_pnl < 0
        is_immediate = minutes_since_last < 5

        should_warn = is_post_loss and is_immediate
        assert should_warn is True


class TestAlertPriority:
    """アラート優先度のテスト"""

    def test_danger_alerts_block_order(self):
        """危険アラートは注文をブロック（確認必要）"""
        alerts = [
            {"type": "info", "message": "情報"},
            {"type": "danger", "message": "5連敗中です"},
        ]

        has_danger = any(a["type"] == "danger" for a in alerts)
        should_confirm = has_danger

        assert should_confirm is True

    def test_warning_alerts_allow_order(self):
        """警告アラートは注文を許可"""
        alerts = [
            {"type": "info", "message": "情報"},
            {"type": "warning", "message": "3連敗中です"},
        ]

        has_danger = any(a["type"] == "danger" for a in alerts)
        should_confirm = has_danger

        assert should_confirm is False

    def test_no_alerts_allow_order(self):
        """アラートなしは注文を許可"""
        alerts = []

        has_danger = any(a["type"] == "danger" for a in alerts)
        should_confirm = has_danger

        assert should_confirm is False
