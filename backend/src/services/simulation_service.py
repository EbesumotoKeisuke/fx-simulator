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
from src.models.pending_order import PendingOrder
from src.services.trading_service import TradingService
from src.utils.logger import get_logger

logger = get_logger(__name__)


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
        logger.info(f"シミュレーション開始: start_time={start_time}, initial_balance={initial_balance}, speed={speed}")

        # 既存のアクティブなシミュレーションがあれば停止
        active = self.get_active_simulation()
        if active:
            active.status = "stopped"
            active.end_time = datetime.utcnow()
            logger.info(f"既存のシミュレーションを停止しました: {active.id}")

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

        logger.info(f"シミュレーションを作成しました: simulation_id={simulation.id}")

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
        try:
            simulation = self.get_active_simulation()
            if not simulation:
                return {
                    "error": "No active simulation",
                }

            # 全ての保有ポジションを自動的にクローズする（ステータス変更前）
            from src.services.trading_service import TradingService
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
                    logger.info(f"ポジションをクローズしました: position_id={position.id}")
                except Exception as e:
                    # ポジションクローズに失敗してもシミュレーション終了は継続
                    logger.warning(f"ポジションのクローズに失敗しました: position_id={position.id}, error={e}")

            # 全ての未約定注文を自動的にキャンセルする（ステータス変更前）
            pending_orders = (
                self.db.query(PendingOrder)
                .filter(PendingOrder.simulation_id == simulation.id)
                .filter(PendingOrder.status == "pending")
                .all()
            )

            for pending_order in pending_orders:
                pending_order.status = "cancelled"
                pending_order.updated_at = datetime.utcnow()

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

            logger.info(f"シミュレーションを停止しました: simulation_id={simulation.id}, final_balance={float(account.balance) if account else 0}, total_trades={trade_count}")

            return {
                "simulation_id": str(simulation.id),
                "status": simulation.status,
                "final_balance": float(account.balance) if account else 0,
                "total_trades": trade_count,
                "profit_loss": float(account.realized_pnl) if account else 0,
            }
        except Exception as e:
            logger.error(f"stop error : {e}")
            return {"error": str(e)}

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

        データがない場合（週末など）は、次の利用可能なデータの時刻まで自動的にスキップする。

        Args:
            new_time (datetime): 新しいシミュレーション時刻

        Returns:
            dict: 更新結果を含む辞書
                - simulation_id (str): シミュレーションID
                - current_time (str): 新しい現在時刻（ISO形式）
                - skipped (bool): 週末などをスキップした場合はTrue
                エラー時は {"error": "エラーメッセージ"}
        """
        try:
            simulation = self.get_active_simulation()
            if not simulation:
                return {"error": "No active simulation"}

            if simulation.status != "running":
                return {"error": "Simulation is not running"}

            # 新しい時刻でM10データが存在するかチェック（週末スキップ機能）
            from .market_data_service import MarketDataService, is_market_open
            market_data_service = MarketDataService(self.db)

            skipped = False

            # まず、市場営業時間外かどうかをチェック
            if not is_market_open(new_time):
                # 市場営業時間外の場合、次の営業時間のデータを探す
                next_data = self._find_next_available_data('M10', new_time, market_data_service)
                if next_data:
                    new_time = datetime.fromisoformat(next_data['timestamp'])
                    skipped = True
                    logger.info(f"市場営業時間外のため時刻をスキップしました: {new_time.isoformat()}")
                else:
                    return {"error": "No more data available - simulation reached end of data"}
            else:
                # 市場営業時間内の場合、データが存在するかチェック
                candles = market_data_service.get_candles_before('M10', new_time, 1)

                if not candles or (candles and abs((datetime.fromisoformat(candles[0]['timestamp']) - new_time).total_seconds()) > 600):
                    # データがない、または最新データが10分以上離れている場合、次のデータを探す
                    next_data = self._find_next_available_data('M10', new_time, market_data_service)
                    if next_data:
                        new_time = datetime.fromisoformat(next_data['timestamp'])
                        skipped = True
                        logger.info(f"データギャップを検出、時刻をスキップしました: {new_time.isoformat()}")
                    else:
                        return {"error": "No more data available - simulation reached end of data"}

            simulation.current_time = new_time

            # 予約注文の約定チェックを実行
            trading_service = TradingService(self.db)
            try:
                trading_service.check_pending_orders_execution(str(simulation.id), new_time)
            except Exception as e:
                logger.warning(f"予約注文の約定チェックに失敗しました: {e}", exc_info=True)
                # 予約注文チェックが失敗しても処理を継続

            # SL/TPの判定を実行
            sltp_result = {"triggered_positions": [], "conflict_positions": []}
            try:
                sltp_result = trading_service.check_sltp_triggers(str(simulation.id), new_time)
            except Exception as e:
                logger.warning(f"SL/TPチェックに失敗しました: {e}", exc_info=True)
                # SL/TPチェックが失敗しても処理を継続

            self.db.commit()

            return {
                "simulation_id": str(simulation.id),
                "current_time": simulation.current_time.isoformat(),
                "skipped": skipped,
                "sltp_triggered": sltp_result.get("triggered_positions", []),
                "sltp_conflicts": sltp_result.get("conflict_positions", []),
            }
        except Exception as e:
            logger.error(f"advance_time error : {e}")
            self.db.rollback()
            return {"error": str(e)}

    def _find_next_available_data(
        self,
        timeframe: str,
        after_time: datetime,
        market_data_service
    ) -> Optional[dict]:
        """
        指定時刻以降の次の利用可能なデータを探す（週末スキップ用）

        FX市場の営業時間（月曜7:00～土曜早朝）のデータのみを返す。
        日曜日のデータは自動的にスキップされる。

        Args:
            timeframe (str): 時間足（通常は'M10'）
            after_time (datetime): この時刻より後のデータを探す
            market_data_service: MarketDataServiceのインスタンス

        Returns:
            Optional[dict]: 次のローソク足データ、見つからない場合はNone
        """
        from ..models.candle import Candle
        from .market_data_service import is_market_open

        # after_time より後の最初のデータを取得（市場営業時間内のみ）
        # 最大100件まで検索して、営業時間内のものを探す
        candidates = (
            self.db.query(Candle)
            .filter(Candle.timeframe == timeframe)
            .filter(Candle.timestamp > after_time)
            .order_by(Candle.timestamp.asc())
            .limit(100)
            .all()
        )

        # 営業時間内の最初のデータを探す
        for candle in candidates:
            if is_market_open(candle.timestamp):
                next_candle = candle
                break
        else:
            # 営業時間内のデータが見つからなかった
            return None

        if next_candle:
            return {
                "timestamp": next_candle.timestamp.isoformat(),
                "open": float(next_candle.open),
                "high": float(next_candle.high),
                "low": float(next_candle.low),
                "close": float(next_candle.close),
                "volume": next_candle.volume,
            }
        return None

    def get_current_time(self) -> Optional[datetime]:
        """
        現在のシミュレーション時刻を取得する

        Returns:
            Optional[datetime]: シミュレーション時刻、
                               アクティブなシミュレーションがない場合はNone
        """
        simulation = self.get_active_simulation()
        return simulation.current_time if simulation else None
