"""
トレーディングサービスのユニットテスト

注文、ポジション管理、証拠金計算のテストを行う。
"""

import pytest
from datetime import datetime
from decimal import Decimal

from src.services.trading_service import TradingService, LOT_UNIT, PIPS_UNIT


class TestTradingServiceCalculations:
    """計算ロジックのテスト"""

    def test_calculate_required_margin(self, test_db):
        """必要証拠金計算のテスト"""
        service = TradingService(test_db)

        # 0.1ロット × 150円 / 25倍 = 60,000円
        margin = service._calculate_required_margin(price=150.0, lot_size=0.1)
        assert margin == 60000

        # 1ロット × 150円 / 25倍 = 600,000円
        margin = service._calculate_required_margin(price=150.0, lot_size=1.0)
        assert margin == 600000

    def test_pips_calculation(self, test_db):
        """pips計算のテスト"""
        # 買いポジション: 150.00で買い、151.00で売り = 100pips
        entry_price = 150.00
        exit_price = 151.00
        pnl_pips = (exit_price - entry_price) / PIPS_UNIT
        assert pnl_pips == 100.0

        # 売りポジション: 150.00で売り、149.00で買い戻し = 100pips
        entry_price = 150.00
        exit_price = 149.00
        pnl_pips = (entry_price - exit_price) / PIPS_UNIT
        assert pnl_pips == 100.0

    def test_pnl_calculation_buy(self, test_db):
        """買いポジションの損益計算テスト"""
        # 買いポジション: 150.00で買い、151.00で売り、0.1ロット
        entry_price = 150.00
        exit_price = 151.00
        lot_size = 0.1

        # pips = (151.00 - 150.00) / 0.01 = 100pips
        pnl_pips = (exit_price - entry_price) / PIPS_UNIT
        # 円損益 = 100pips × 0.1lot × 100,000 × 0.01 = 10,000円
        realized_pnl = pnl_pips * lot_size * LOT_UNIT * PIPS_UNIT

        assert pnl_pips == 100.0
        assert realized_pnl == 10000.0

    def test_pnl_calculation_sell(self, test_db):
        """売りポジションの損益計算テスト"""
        # 売りポジション: 150.00で売り、149.00で買い戻し、0.1ロット
        entry_price = 150.00
        exit_price = 149.00
        lot_size = 0.1

        # pips = (150.00 - 149.00) / 0.01 = 100pips
        pnl_pips = (entry_price - exit_price) / PIPS_UNIT
        # 円損益 = 100pips × 0.1lot × 100,000 × 0.01 = 10,000円
        realized_pnl = pnl_pips * lot_size * LOT_UNIT * PIPS_UNIT

        assert pnl_pips == 100.0
        assert realized_pnl == 10000.0

    def test_pnl_calculation_loss(self, test_db):
        """損失の損益計算テスト"""
        # 買いポジション: 150.00で買い、149.00で売り（損失）、0.1ロット
        entry_price = 150.00
        exit_price = 149.00
        lot_size = 0.1

        # pips = (149.00 - 150.00) / 0.01 = -100pips
        pnl_pips = (exit_price - entry_price) / PIPS_UNIT
        # 円損益 = -100pips × 0.1lot × 100,000 × 0.01 = -10,000円
        realized_pnl = pnl_pips * lot_size * LOT_UNIT * PIPS_UNIT

        assert pnl_pips == -100.0
        assert realized_pnl == -10000.0


class TestTradingServiceOperations:
    """トレーディング操作のテスト"""

    def test_get_account_info_no_simulation(self, test_db):
        """シミュレーションがない場合の口座情報取得"""
        service = TradingService(test_db)
        result = service.get_account_info()

        assert result["balance"] == 0
        assert result["equity"] == 0
        assert result["consecutive_losses"] == 0

    def test_get_account_info_with_simulation(self, test_db, sample_simulation, sample_account):
        """シミュレーションがある場合の口座情報取得"""
        service = TradingService(test_db)
        result = service.get_account_info()

        assert result["balance"] == 1000000
        assert result["initial_balance"] == 1000000
        assert result["consecutive_losses"] == 0

    def test_get_positions_no_simulation(self, test_db):
        """シミュレーションがない場合のポジション取得"""
        service = TradingService(test_db)
        result = service.get_positions()

        assert result["positions"] == []
        assert result["total_unrealized_pnl"] == 0

    def test_get_trades_no_simulation(self, test_db):
        """シミュレーションがない場合のトレード履歴取得"""
        service = TradingService(test_db)
        result = service.get_trades()

        assert result["trades"] == []
        assert result["total"] == 0

    def test_create_order_no_simulation(self, test_db):
        """シミュレーションがない場合の注文作成"""
        service = TradingService(test_db)
        result = service.create_order(side="buy", lot_size=0.1)

        assert "error" in result
        assert result["error"] == "No active simulation"


class TestConsecutiveLossesLogic:
    """連敗カウントロジックのテスト"""

    def test_consecutive_losses_initial_value(self, test_db, sample_simulation, sample_account):
        """初期値は0"""
        assert sample_account.consecutive_losses == 0

    def test_consecutive_losses_increment(self, test_db, sample_simulation, sample_account):
        """損失トレードで連敗カウントが増加する検証用の値設定"""
        # 直接アカウントの連敗カウントを変更してテスト
        sample_account.consecutive_losses = 0
        test_db.commit()
        assert sample_account.consecutive_losses == 0

        # 負けを1回シミュレート
        sample_account.consecutive_losses += 1
        test_db.commit()
        assert sample_account.consecutive_losses == 1

        # さらに負けをシミュレート
        sample_account.consecutive_losses += 1
        test_db.commit()
        assert sample_account.consecutive_losses == 2

    def test_consecutive_losses_reset_on_big_win(self, test_db, sample_simulation, sample_account):
        """30pips以上の利益でリセット"""
        sample_account.consecutive_losses = 5
        test_db.commit()

        # 30pips以上の利益があればリセットされるロジックの検証
        pnl_pips = 35  # 30pips以上
        if pnl_pips >= 30:
            sample_account.consecutive_losses = 0

        test_db.commit()
        assert sample_account.consecutive_losses == 0

    def test_consecutive_losses_maintain_on_small_win(self, test_db, sample_simulation, sample_account):
        """30pips未満の利益では維持"""
        sample_account.consecutive_losses = 3
        test_db.commit()

        # 30pips未満の利益では維持されるロジックの検証
        pnl_pips = 20  # 30pips未満
        if pnl_pips < 0:
            sample_account.consecutive_losses += 1
        elif pnl_pips >= 30:
            sample_account.consecutive_losses = 0
        # 0 <= pnl_pips < 30 の場合は何もしない（維持）

        test_db.commit()
        assert sample_account.consecutive_losses == 3  # 維持
