"""
シミュレーション管理サービス

シミュレーションのライフサイクル（開始、停止、一時停止、再開）を管理する。
シミュレーション開始時に口座を作成し、シミュレーション時刻の進行も制御する。

使用例:
    service = SimulationService(db)
    result = service.start(
        start_time=datetime(2024, 1, 1, 9, 0),
        initial_balance=1000000,
        speed=1.0
    )
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from src.models.simulation import Simulation
from src.models.account import Account
from src.models.position import Position
from src.models.trade import Trade
from src.services.trading_service import TradingService


class SimulationService:
    """
    シミュレーション管理サービスクラス

    シミュレーションの作成、制御、状態管理を行う。
    1つのシミュレーションに対して1つの口座が紐づく。

    Attributes:
        db (Session): SQLAlchemyデータベースセッション
    """

    def __init__(self, db: Session):
        """
        SimulationServiceを初期化する

        Args:
            db (Session): SQLAlchemyデータベースセッション
        """
        self.db = db

    def get_active_simulation(self) -> Optional[Simulation]:
        """
        アクティブなシミュレーションを取得する

        status が 'created', 'running', 'paused' のいずれかであるシミュレーションを
        作成日時の降順で検索し、最新のものを返す。

        Returns:
            Optional[Simulation]: アクティブなシミュレーション、存在しない場合はNone
        """
        return (
            self.db.query(Simulation)
            .filter(Simulation.status.in_(["created", "running", "paused"]))
            .order_by(Simulation.created_at.desc())
            .first()
        )

    def start(
        self,
        start_time: datetime,
        initial_balance: float,
        speed: float = 1.0,
    ) -> dict:
        """
        新しいシミュレーションを開始する

        既存のアクティブなシミュレーションがある場合は自動的に停止する。
        シミュレーション開始時に指定された初期資金で口座を作成する。

        Args:
            start_time (datetime): シミュレーション開始時刻
            initial_balance (float): 初期資金（円）
            speed (float, optional): 再生速度倍率。デフォルトは1.0

        Returns:
            dict: シミュレーション情報を含む辞書
                - simulation_id (str): シミュレーションID
                - status (str): 状態（'created'）
                - current_time (str): 現在時刻（ISO形式）
                - speed (float): 再生速度
                - balance (float): 口座残高
        """
        # 既存のアクティブなシミュレーションがあれば停止
        active = self.get_active_simulation()
        if active:
            active.status = "stopped"
            active.end_time = datetime.utcnow()

        # 新しいシミュレーションを作成
        simulation = Simulation(
            start_time=start_time,
            current_time=start_time,
            speed=Decimal(str(speed)),
            status="created",
        )
        self.db.add(simulation)
        self.db.flush()

        # 口座を作成
        account = Account(
            simulation_id=simulation.id,
            initial_balance=Decimal(str(initial_balance)),
            balance=Decimal(str(initial_balance)),
            equity=Decimal(str(initial_balance)),
            realized_pnl=Decimal("0"),
        )
        self.db.add(account)
        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "status": simulation.status,
            "current_time": simulation.current_time.isoformat(),
            "speed": float(simulation.speed),
            "balance": float(account.balance),
        }

    def stop(self) -> dict:
        """
        シミュレーションを終了する

        アクティブなシミュレーションのstatusを'stopped'に変更し、
        終了時刻を記録する。口座情報とトレード数も取得して返す。
        終了時に保有中のポジションを全て自動的にクローズする。

        Returns:
            dict: 終了結果を含む辞書
                - simulation_id (str): シミュレーションID
                - status (str): 状態（'stopped'）
                - final_balance (float): 最終残高
                - total_trades (int): 総トレード数
                - profit_loss (float): 確定損益
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {
                "error": "No active simulation",
            }

        # 全ての保有ポジションを自動的にクローズする（ステータス変更前）
        trading_service = TradingService(self.db)
        open_positions = (
            self.db.query(Position)
            .filter(Position.simulation_id == simulation.id)
            .filter(Position.status == "open")
            .all()
        )

        for position in open_positions:
            try:
                trading_service.close_position(str(position.id))
            except Exception as e:
                # ポジションクローズに失敗してもシミュレーション終了は継続
                print(f"Failed to close position {position.id}: {e}")

        simulation.status = "stopped"
        simulation.end_time = datetime.utcnow()

        # 口座情報を取得
        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation.id)
            .first()
        )

        # トレード数を取得
        trade_count = (
            self.db.query(Trade)
            .filter(Trade.simulation_id == simulation.id)
            .count()
        )

        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "status": simulation.status,
            "final_balance": float(account.balance) if account else 0,
            "total_trades": trade_count,
            "profit_loss": float(account.realized_pnl) if account else 0,
        }

    def pause(self) -> dict:
        """
        シミュレーションを一時停止する

        実行中のシミュレーションのstatusを'paused'に変更する。
        既に一時停止中または停止済みの場合はエラーを返す。

        Returns:
            dict: 一時停止結果を含む辞書
                - simulation_id (str): シミュレーションID
                - status (str): 状態（'paused'）
                - current_time (str): 現在時刻（ISO形式）
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status != "running":
            return {"error": "Simulation is not running"}

        simulation.status = "paused"
        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "status": simulation.status,
            "current_time": simulation.current_time.isoformat(),
        }

    def resume(self) -> dict:
        """
        作成済みまたは一時停止中のシミュレーションを開始/再開する

        'created'または'paused'状態のシミュレーションのstatusを'running'に変更する。
        それ以外の状態の場合はエラーを返す。

        Returns:
            dict: 開始/再開結果を含む辞書
                - simulation_id (str): シミュレーションID
                - status (str): 状態（'running'）
                - current_time (str): 現在時刻（ISO形式）
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status not in ["created", "paused"]:
            return {"error": "Simulation must be in 'created' or 'paused' status"}

        simulation.status = "running"
        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "status": simulation.status,
            "current_time": simulation.current_time.isoformat(),
        }

    def set_speed(self, speed: float) -> dict:
        """
        シミュレーションの再生速度を変更する

        Args:
            speed (float): 新しい再生速度倍率（0.5〜10.0）

        Returns:
            dict: 変更結果を含む辞書
                - simulation_id (str): シミュレーションID
                - speed (float): 新しい再生速度
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        simulation.speed = Decimal(str(speed))
        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "speed": float(simulation.speed),
        }

    def get_status(self) -> dict:
        """
        シミュレーションの現在状態を取得する

        アクティブなシミュレーションがない場合は、statusを'idle'として
        デフォルト値を返す。

        Returns:
            dict: 状態情報を含む辞書
                - simulation_id (str|None): シミュレーションID
                - status (str): 状態（'idle', 'running', 'paused', 'stopped'）
                - current_time (str|None): 現在時刻（ISO形式）
                - speed (float): 再生速度
                - balance (float): 口座残高
                - equity (float): 有効証拠金
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {
                "simulation_id": None,
                "status": "idle",
                "current_time": None,
                "speed": 1.0,
            }

        account = (
            self.db.query(Account)
            .filter(Account.simulation_id == simulation.id)
            .first()
        )

        return {
            "simulation_id": str(simulation.id),
            "status": simulation.status,
            "current_time": simulation.current_time.isoformat(),
            "speed": float(simulation.speed),
            "balance": float(account.balance) if account else 0,
            "equity": float(account.equity) if account else 0,
        }

    def advance_time(self, new_time: datetime) -> dict:
        """
        シミュレーション時刻を進める

        実行中のシミュレーションの現在時刻を指定した時刻に更新する。
        一時停止中または停止済みの場合はエラーを返す。

        Args:
            new_time (datetime): 新しいシミュレーション時刻

        Returns:
            dict: 更新結果を含む辞書
                - simulation_id (str): シミュレーションID
                - current_time (str): 新しい現在時刻（ISO形式）
                エラー時は {"error": "エラーメッセージ"}
        """
        simulation = self.get_active_simulation()
        if not simulation:
            return {"error": "No active simulation"}

        if simulation.status != "running":
            return {"error": "Simulation is not running"}

        simulation.current_time = new_time
        self.db.commit()

        return {
            "simulation_id": str(simulation.id),
            "current_time": simulation.current_time.isoformat(),
        }

    def get_current_time(self) -> Optional[datetime]:
        """
        現在のシミュレーション時刻を取得する

        Returns:
            Optional[datetime]: シミュレーション時刻、
                               アクティブなシミュレーションがない場合はNone
        """
        simulation = self.get_active_simulation()
        return simulation.current_time if simulation else None
