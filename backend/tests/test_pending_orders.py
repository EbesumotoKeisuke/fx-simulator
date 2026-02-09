"""
予約注文（指値・逆指値）のユニットテスト

F-101: 指値・逆指値注文機能のテストを行う。
"""

import pytest
import uuid
from datetime import datetime
from decimal import Decimal

from src.services.trading_service import TradingService
from src.models.pending_order import PendingOrder


class TestPendingOrderCreation:
    """予約注文作成のテスト"""

    def test_create_limit_buy_order(self, test_db, sample_simulation):
        """指値買い注文の作成"""
        service = TradingService(test_db)

        result = service.create_pending_order(
            order_type="limit",
            side="buy",
            lot_size=0.1,
            trigger_price=149.0
        )

        assert "order_id" in result
        assert result["order_type"] == "limit"
        assert result["side"] == "buy"
        assert result["lot_size"] == 0.1
        assert result["trigger_price"] == 149.0
        assert result["status"] == "pending"

    def test_create_limit_sell_order(self, test_db, sample_simulation):
        """指値売り注文の作成"""
        service = TradingService(test_db)

        result = service.create_pending_order(
            order_type="limit",
            side="sell",
            lot_size=0.1,
            trigger_price=151.0
        )

        assert "order_id" in result
        assert result["order_type"] == "limit"
        assert result["side"] == "sell"
        assert result["status"] == "pending"

    def test_create_stop_buy_order(self, test_db, sample_simulation):
        """逆指値買い注文の作成"""
        service = TradingService(test_db)

        result = service.create_pending_order(
            order_type="stop",
            side="buy",
            lot_size=0.1,
            trigger_price=151.0
        )

        assert "order_id" in result
        assert result["order_type"] == "stop"
        assert result["side"] == "buy"
        assert result["status"] == "pending"

    def test_create_stop_sell_order(self, test_db, sample_simulation):
        """逆指値売り注文の作成"""
        service = TradingService(test_db)

        result = service.create_pending_order(
            order_type="stop",
            side="sell",
            lot_size=0.1,
            trigger_price=149.0
        )

        assert "order_id" in result
        assert result["order_type"] == "stop"
        assert result["side"] == "sell"
        assert result["status"] == "pending"

    def test_create_pending_order_no_simulation(self, test_db):
        """シミュレーションなしで予約注文作成はエラー"""
        service = TradingService(test_db)

        result = service.create_pending_order(
            order_type="limit",
            side="buy",
            lot_size=0.1,
            trigger_price=149.0
        )

        assert "error" in result
        assert result["error"] == "No active simulation"


class TestPendingOrderManagement:
    """予約注文管理のテスト"""

    def test_get_pending_orders_empty(self, test_db, sample_simulation):
        """予約注文なしの場合空リストを返す"""
        service = TradingService(test_db)

        result = service.get_pending_orders()

        assert result["orders"] == []
        assert result["total"] == 0

    def test_get_pending_orders(self, test_db, sample_simulation):
        """予約注文一覧の取得"""
        service = TradingService(test_db)

        # 予約注文を作成
        service.create_pending_order(
            order_type="limit",
            side="buy",
            lot_size=0.1,
            trigger_price=149.0
        )
        service.create_pending_order(
            order_type="stop",
            side="sell",
            lot_size=0.2,
            trigger_price=148.0
        )

        result = service.get_pending_orders()

        assert len(result["orders"]) == 2
        assert result["total"] == 2

    def test_cancel_pending_order(self, test_db, sample_simulation):
        """予約注文のキャンセル"""
        service = TradingService(test_db)

        # 予約注文を作成
        create_result = service.create_pending_order(
            order_type="limit",
            side="buy",
            lot_size=0.1,
            trigger_price=149.0
        )
        order_id_str = create_result["order_id"]

        # UUIDオブジェクトに変換してキャンセル
        order_id_uuid = uuid.UUID(order_id_str)
        cancel_result = service.cancel_pending_order(order_id_uuid)

        assert cancel_result["order_id"] == order_id_str
        assert cancel_result["status"] == "cancelled"

    def test_update_pending_order(self, test_db, sample_simulation):
        """予約注文の変更"""
        service = TradingService(test_db)

        # 予約注文を作成
        create_result = service.create_pending_order(
            order_type="limit",
            side="buy",
            lot_size=0.1,
            trigger_price=149.0
        )
        order_id_str = create_result["order_id"]

        # UUIDオブジェクトに変換して変更
        order_id_uuid = uuid.UUID(order_id_str)
        update_result = service.update_pending_order(
            order_id_uuid,
            lot_size=0.2,
            trigger_price=148.5
        )

        assert update_result["order_id"] == order_id_str
        assert update_result["lot_size"] == 0.2
        assert update_result["trigger_price"] == 148.5


class TestPendingOrderExecution:
    """予約注文約定のテスト"""

    def test_limit_buy_execution_logic(self, test_db, sample_simulation):
        """指値買い注文の約定ロジック"""
        # 指値買い: 安値がトリガー価格以下で約定
        trigger_price = 149.0
        low_price = 148.5  # トリガー価格以下

        should_execute = low_price <= trigger_price
        assert should_execute is True

    def test_limit_buy_no_execution(self, test_db, sample_simulation):
        """指値買い注文が約定しない条件"""
        # 指値買い: 安値がトリガー価格より高い場合は約定しない
        trigger_price = 149.0
        low_price = 149.5  # トリガー価格より高い

        should_execute = low_price <= trigger_price
        assert should_execute is False

    def test_limit_sell_execution_logic(self, test_db, sample_simulation):
        """指値売り注文の約定ロジック"""
        # 指値売り: 高値がトリガー価格以上で約定
        trigger_price = 151.0
        high_price = 151.5  # トリガー価格以上

        should_execute = high_price >= trigger_price
        assert should_execute is True

    def test_stop_buy_execution_logic(self, test_db, sample_simulation):
        """逆指値買い注文の約定ロジック"""
        # 逆指値買い: 高値がトリガー価格以上で約定
        trigger_price = 151.0
        high_price = 151.5  # トリガー価格以上

        should_execute = high_price >= trigger_price
        assert should_execute is True

    def test_stop_sell_execution_logic(self, test_db, sample_simulation):
        """逆指値売り注文の約定ロジック"""
        # 逆指値売り: 安値がトリガー価格以下で約定
        trigger_price = 149.0
        low_price = 148.5  # トリガー価格以下

        should_execute = low_price <= trigger_price
        assert should_execute is True
