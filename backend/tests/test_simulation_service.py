"""
シミュレーションサービスのユニットテスト

シミュレーションの開始、停止、一時停止、再開、時刻進行のテストを行う。
"""

import pytest
from datetime import datetime
from decimal import Decimal

from src.services.simulation_service import SimulationService
from src.models.simulation import Simulation
from src.models.account import Account


class TestSimulationService:
    """SimulationServiceのテスト"""

    def test_start_simulation(self, test_db):
        """シミュレーション開始のテスト"""
        service = SimulationService(test_db)

        result = service.start(
            start_time=datetime(2024, 1, 15, 9, 0, 0),
            initial_balance=1000000,
            speed=1.0
        )

        assert result["status"] == "created"
        assert result["speed"] == 1.0
        assert result["balance"] == 1000000

    def test_stop_simulation(self, test_db, sample_simulation):
        """シミュレーション停止のテスト"""
        service = SimulationService(test_db)

        result = service.stop()

        assert result["status"] == "stopped"
        assert "final_balance" in result

    def test_pause_simulation(self, test_db, sample_simulation):
        """シミュレーション一時停止のテスト"""
        service = SimulationService(test_db)

        result = service.pause()

        assert result["status"] == "paused"

    def test_resume_simulation(self, test_db, sample_simulation):
        """シミュレーション再開のテスト"""
        service = SimulationService(test_db)

        # まず一時停止
        service.pause()

        # 再開
        result = service.resume()

        assert result["status"] == "running"

    def test_get_status_no_simulation(self, test_db):
        """シミュレーションがない場合の状態取得"""
        service = SimulationService(test_db)

        result = service.get_status()

        assert result["status"] == "idle"
        assert result["simulation_id"] is None

    def test_get_status_with_simulation(self, test_db, sample_simulation):
        """シミュレーションがある場合の状態取得"""
        service = SimulationService(test_db)

        result = service.get_status()

        assert result["status"] == "running"
        assert result["simulation_id"] is not None

    def test_set_speed(self, test_db, sample_simulation):
        """再生速度変更のテスト"""
        service = SimulationService(test_db)

        result = service.set_speed(2.0)

        assert result["speed"] == 2.0


class TestSimulationServiceAdvanceTime:
    """advanceTime関連のテスト"""

    def test_advance_time_not_running_returns_error(self, test_db, sample_simulation):
        """実行中でない場合はエラーを返す"""
        service = SimulationService(test_db)

        # 一時停止
        service.pause()

        # 時刻を進めようとする
        result = service.advance_time(datetime(2024, 1, 15, 9, 40, 0))

        assert "error" in result
        assert "not running" in result["error"]

    def test_advance_time_no_simulation_returns_error(self, test_db):
        """シミュレーションがない場合はエラーを返す"""
        service = SimulationService(test_db)

        result = service.advance_time(datetime(2024, 1, 15, 9, 40, 0))

        assert "error" in result
        assert "No active simulation" in result["error"]
