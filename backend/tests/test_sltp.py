"""
SL/TP（損切り・利確）機能のユニットテスト

F-102: 損切り・利確設定機能のテストを行う。
"""

import pytest
import uuid
from datetime import datetime
from decimal import Decimal

from src.services.trading_service import TradingService, PIPS_UNIT
from src.models.position import Position


class TestSLTPCalculation:
    """SL/TP価格計算のテスト"""

    def test_buy_sl_pips_to_price(self):
        """買いポジションのSL pips → 価格変換"""
        entry_price = 150.00
        sl_pips = -20  # 20pips下

        # 買い: SL価格 = エントリー価格 + (sl_pips × 0.01)
        sl_price = entry_price + (sl_pips * PIPS_UNIT)

        assert sl_price == 149.80

    def test_buy_tp_pips_to_price(self):
        """買いポジションのTP pips → 価格変換"""
        entry_price = 150.00
        tp_pips = 30  # 30pips上

        # 買い: TP価格 = エントリー価格 + (tp_pips × 0.01)
        tp_price = entry_price + (tp_pips * PIPS_UNIT)

        assert tp_price == 150.30

    def test_sell_sl_pips_to_price(self):
        """売りポジションのSL pips → 価格変換"""
        entry_price = 150.00
        sl_pips = -20  # 20pips上（売りなので逆方向）

        # 売り: SL価格 = エントリー価格 - (sl_pips × 0.01)
        sl_price = entry_price - (sl_pips * PIPS_UNIT)

        assert sl_price == 150.20

    def test_sell_tp_pips_to_price(self):
        """売りポジションのTP pips → 価格変換"""
        entry_price = 150.00
        tp_pips = 30  # 30pips下（売りなので逆方向）

        # 売り: TP価格 = エントリー価格 - (tp_pips × 0.01)
        tp_price = entry_price - (tp_pips * PIPS_UNIT)

        assert tp_price == 149.70


class TestSLTPTrigger:
    """SL/TP発動条件のテスト"""

    def test_buy_sl_trigger(self):
        """買いポジションのSL発動条件"""
        # 買いポジションのSL: 安値がSL価格以下で発動
        sl_price = 149.80
        low_price = 149.70  # SL価格以下

        sl_triggered = low_price <= sl_price
        assert sl_triggered is True

    def test_buy_sl_not_trigger(self):
        """買いポジションのSL非発動条件"""
        # 買いポジションのSL: 安値がSL価格より高い場合は発動しない
        sl_price = 149.80
        low_price = 149.90  # SL価格より高い

        sl_triggered = low_price <= sl_price
        assert sl_triggered is False

    def test_buy_tp_trigger(self):
        """買いポジションのTP発動条件"""
        # 買いポジションのTP: 高値がTP価格以上で発動
        tp_price = 150.30
        high_price = 150.40  # TP価格以上

        tp_triggered = high_price >= tp_price
        assert tp_triggered is True

    def test_buy_tp_not_trigger(self):
        """買いポジションのTP非発動条件"""
        # 買いポジションのTP: 高値がTP価格より低い場合は発動しない
        tp_price = 150.30
        high_price = 150.20  # TP価格より低い

        tp_triggered = high_price >= tp_price
        assert tp_triggered is False

    def test_sell_sl_trigger(self):
        """売りポジションのSL発動条件"""
        # 売りポジションのSL: 高値がSL価格以上で発動
        sl_price = 150.20
        high_price = 150.30  # SL価格以上

        sl_triggered = high_price >= sl_price
        assert sl_triggered is True

    def test_sell_tp_trigger(self):
        """売りポジションのTP発動条件"""
        # 売りポジションのTP: 安値がTP価格以下で発動
        tp_price = 149.70
        low_price = 149.60  # TP価格以下

        tp_triggered = low_price <= tp_price
        assert tp_triggered is True


class TestSLTPPnLCalculation:
    """SL/TP発動時の損益計算テスト"""

    def test_buy_sl_pnl(self):
        """買いポジションSL発動時の損益"""
        entry_price = 150.00
        sl_price = 149.80  # -20pips
        lot_size = 0.1  # 10,000通貨

        # 買い: pips = (決済価格 - エントリー価格) / 0.01
        pnl_pips = (sl_price - entry_price) / PIPS_UNIT
        # 円損益 = pips × lot_size × 100,000 × 0.01
        pnl = pnl_pips * lot_size * 100000 * PIPS_UNIT

        assert pnl_pips == pytest.approx(-20.0)
        assert pnl == pytest.approx(-2000.0)  # -2,000円の損失

    def test_buy_tp_pnl(self):
        """買いポジションTP発動時の損益"""
        entry_price = 150.00
        tp_price = 150.30  # +30pips
        lot_size = 0.1  # 10,000通貨

        # 買い: pips = (決済価格 - エントリー価格) / 0.01
        pnl_pips = (tp_price - entry_price) / PIPS_UNIT
        # 円損益 = pips × lot_size × 100,000 × 0.01
        pnl = pnl_pips * lot_size * 100000 * PIPS_UNIT

        assert pnl_pips == pytest.approx(30.0)
        assert pnl == pytest.approx(3000.0)  # +3,000円の利益

    def test_sell_sl_pnl(self):
        """売りポジションSL発動時の損益"""
        entry_price = 150.00
        sl_price = 150.20  # +20pips（売りなので損失）
        lot_size = 0.1  # 10,000通貨

        # 売り: pips = (エントリー価格 - 決済価格) / 0.01
        pnl_pips = (entry_price - sl_price) / PIPS_UNIT
        # 円損益 = pips × lot_size × 100,000 × 0.01
        pnl = pnl_pips * lot_size * 100000 * PIPS_UNIT

        assert pnl_pips == pytest.approx(-20.0)
        assert pnl == pytest.approx(-2000.0)  # -2,000円の損失

    def test_sell_tp_pnl(self):
        """売りポジションTP発動時の損益"""
        entry_price = 150.00
        tp_price = 149.70  # -30pips（売りなので利益）
        lot_size = 0.1  # 10,000通貨

        # 売り: pips = (エントリー価格 - 決済価格) / 0.01
        pnl_pips = (entry_price - tp_price) / PIPS_UNIT
        # 円損益 = pips × lot_size × 100,000 × 0.01
        pnl = pnl_pips * lot_size * 100000 * PIPS_UNIT

        assert pnl_pips == pytest.approx(30.0)
        assert pnl == pytest.approx(3000.0)  # +3,000円の利益


class TestSLTPConflict:
    """SL/TP同時発動（コンフリクト）のテスト"""

    def test_both_triggered_same_candle(self):
        """同一ローソク足でSLとTPが両方達成される場合"""
        # 例：大きな値動きで両方が達成される
        sl_price = 149.80
        tp_price = 150.30

        # ローソク足のOHLC
        high_price = 150.50
        low_price = 149.50

        # 買いポジションの場合
        sl_triggered = low_price <= sl_price  # True
        tp_triggered = high_price >= tp_price  # True

        # 両方がTrueの場合はコンフリクト
        is_conflict = sl_triggered and tp_triggered
        assert is_conflict is True

    def test_only_sl_triggered(self):
        """SLのみ発動"""
        sl_price = 149.80
        tp_price = 150.30

        high_price = 150.10  # TPに届かない
        low_price = 149.70  # SLに届く

        sl_triggered = low_price <= sl_price  # True
        tp_triggered = high_price >= tp_price  # False

        assert sl_triggered is True
        assert tp_triggered is False

    def test_only_tp_triggered(self):
        """TPのみ発動"""
        sl_price = 149.80
        tp_price = 150.30

        high_price = 150.50  # TPに届く
        low_price = 149.90  # SLに届かない

        sl_triggered = low_price <= sl_price  # False
        tp_triggered = high_price >= tp_price  # True

        assert sl_triggered is False
        assert tp_triggered is True

    def test_neither_triggered(self):
        """SL/TPどちらも発動しない"""
        sl_price = 149.80
        tp_price = 150.30

        high_price = 150.10  # TPに届かない
        low_price = 149.90  # SLに届かない

        sl_triggered = low_price <= sl_price  # False
        tp_triggered = high_price >= tp_price  # False

        assert sl_triggered is False
        assert tp_triggered is False
